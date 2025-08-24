#![allow(dead_code)]

use once_cell::sync::Lazy;
use regex::Regex;
use tracing::span::Attributes;
use tracing::{Id, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{Layer, Registry};

#[allow(clippy::unwrap_used)]
pub static RE_REQUEST_ID: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"req_id:\s*(?P<request_id>[^,]+)").unwrap());

#[derive(Clone)]
pub struct ValuesLayer();

/// Returns the current span and the op id value recorded in that span.
pub fn get_request_id() -> Option<String> {
    let span = tracing::span::Span::current();

    let result = span.with_subscriber(|(id, sub)| {
        sub.downcast_ref::<Registry>()
            .and_then(|reg| reg.span(id))
            .and_then(|span| span.extensions().get::<String>().map(String::clone))
    });

    result?
}

impl<S: Subscriber + for<'lookup> LookupSpan<'lookup>> Layer<S> for ValuesLayer {
    fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        let values = attrs.values().to_string();

        if let Some(cap) = RE_REQUEST_ID.captures(&values) {
            if let Some(span) = ctx.span(id) {
                let mut ext = span.extensions_mut();
                ext.insert(cap["request_id"].to_string());
            }
        }
    }
}

/// tracing日志时间
/// 临时，tracing库自带有问题，tracing-subscriber/src/fmt/time/time_crate.rs
/// TODO 待官方修复
#[derive(Debug, Clone, Copy, Eq, PartialEq, Default)]
pub struct LocalTime;

impl tracing_subscriber::fmt::time::FormatTime for LocalTime {
    fn format_time(&self, w: &mut tracing_subscriber::fmt::format::Writer<'_>) -> std::fmt::Result {
        let t = chrono::Local::now().naive_local();
        write!(w, "{}", t)
    }
}
