use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use chrono::{DateTime, Utc};
use futures_util::Stream;
use tokio::sync::mpsc;
use tokio::time::Interval;

#[derive(Clone, Debug)]
pub struct SseStats {
    duration: Duration,
    bytes_sent: u64,
    messages_sent: u64,
}

pub trait GuardListener {
    fn close(&self, stats: SseStats);
}

struct SseConnectionGuard<T: GuardListener> {
    listener: T,
    connected_at: DateTime<Utc>,
    bytes_sent: Arc<std::sync::atomic::AtomicU64>,
    messages_sent: Arc<std::sync::atomic::AtomicU64>,
}

impl<T: GuardListener> Unpin for GuardedSseStream<T> {}

impl<T: GuardListener> SseConnectionGuard<T> {
    fn new(listener: T) -> Self {
        Self {
            listener,
            connected_at: Utc::now(),
            bytes_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            messages_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    fn track_message(&self, message_size: usize) {
        self.bytes_sent.fetch_add(message_size as u64, std::sync::atomic::Ordering::Relaxed);
        self.messages_sent.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    fn get_stats(&self) -> SseStats{
        let bytes = self.bytes_sent.load(std::sync::atomic::Ordering::Relaxed);
        let messages = self.messages_sent.load(std::sync::atomic::Ordering::Relaxed);
        let duration = Utc::now()
            .signed_duration_since(self.connected_at)
            .to_std()
            .unwrap_or(Duration::ZERO);
        SseStats {
            duration,
            bytes_sent: bytes,
            messages_sent: messages,
        }
    }
}

impl<T: GuardListener> Drop for SseConnectionGuard<T> {
    fn drop(&mut self) {
        let stats = self.get_stats();
        self.listener.close(stats);
    }
}

pub struct GuardedSseStream<T: GuardListener> {
    rx: mpsc::UnboundedReceiver<String>,
    heartbeat_interval: Option<Interval>,
    _guard: SseConnectionGuard<T>, // 保持 guard 存活
}

impl<T: GuardListener> GuardedSseStream<T> {
    fn new(
        rx: mpsc::UnboundedReceiver<String>,
        listener: T,
        heartbeat_interval: Option<Interval>,
    ) -> Self {
        Self {
            rx,
            heartbeat_interval,
            _guard: SseConnectionGuard::new(listener),
        }
    }
}

impl<T: GuardListener> Stream for GuardedSseStream<T> {
    type Item = Result<axum::response::sse::Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // 检查是否有新消息
        match self.rx.poll_recv(cx) {
            Poll::Ready(Some(message)) => {
                // 记录消息统计
                self._guard.track_message(message.len());
                return Poll::Ready(Some(Ok(
                    axum::response::sse::Event::default().data(message)
                )));
            }
            Poll::Ready(None) => {
                // Channel closed
                return Poll::Ready(None); // 这会触发 Drop
            }
            Poll::Pending => {}
        }

        // 发送心跳
        if let Some(heartbeat_interval) = &mut self.heartbeat_interval {
            if let Poll::Ready(_) = heartbeat_interval.poll_tick(cx) {
                let message = "heartbeat";
                self._guard.track_message(message.len());
                return Poll::Ready(Some(Ok(
                    axum::response::sse::Event::default().data(message)
                )));
            }
        }

        Poll::Pending
    }
}
