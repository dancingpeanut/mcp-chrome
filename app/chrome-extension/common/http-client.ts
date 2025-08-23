/**
 * HTTP client for communicating with Python server
 * Replaces Native Messaging communication
 */

export interface ServerConfig {
  baseUrl: string;
  port: number;
  timeout: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class HttpClient {
  private config: ServerConfig;
  private baseUrl: string;

  constructor(config: ServerConfig) {
    this.config = config;
    this.baseUrl = `http://${config.baseUrl}:${config.port}`;
  }

  /**
   * Make HTTP request to Python server
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      console.log(`Making HTTP request to: ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`HTTP response from ${endpoint}:`, data);
      return data;
    } catch (error) {
      console.error(`HTTP request to ${endpoint} failed:`, error);
      
      // Provide more specific error messages
      let errorMessage = 'Unknown error';
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error - server may not be running';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Call tool on Python server
   */
  async callTool(toolName: string, params: any): Promise<ApiResponse> {
    return this.request('/api/tools/call', {
      method: 'POST',
      body: JSON.stringify({
        tool: toolName,
        params: params,
      }),
    });
  }

  /**
   * Get server status
   */
  async getServerStatus(): Promise<ApiResponse> {
    return this.request('/api/status');
  }

  /**
   * Start server
   */
  async startServer(port?: number): Promise<ApiResponse> {
    return this.request('/api/server/start', {
      method: 'POST',
      body: JSON.stringify({ port }),
    });
  }

  /**
   * Stop server
   */
  async stopServer(): Promise<ApiResponse> {
    return this.request('/api/server/stop', {
      method: 'POST',
    });
  }

  /**
   * Process data
   */
  async processData(data: any): Promise<ApiResponse> {
    return this.request('/api/process', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

// Default configuration
export const defaultHttpConfig: ServerConfig = {
  baseUrl: '127.0.0.1',
  port: 12306,
  timeout: 30000,
};

export const httpClient = new HttpClient(defaultHttpConfig);
