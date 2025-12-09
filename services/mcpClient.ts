import { JsonRpcMessage, JsonRpcResponse, JsonRpcRequest, JsonRpcNotification } from '../types';

type MessageHandler = (message: JsonRpcMessage) => void;
type ErrorHandler = (error: string) => void;

export interface ProxyConfig {
  enabled: boolean;
  prefix: string;
}

export class McpClient {
  private abortController: AbortController | null = null;
  private postUrl: string | null = null;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private pendingRequests: Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private requestCounter = 0;
  
  private proxyConfig: ProxyConfig = { enabled: false, prefix: '' };
  private originalSseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor() {}

  connect(sseUrl: string, proxyConfig: ProxyConfig = { enabled: false, prefix: '' }, headers: Record<string, string> = {}): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.proxyConfig = proxyConfig;
        this.originalSseUrl = sseUrl;
        this.headers = headers;

        // Close existing connection if any
        this.disconnect();

        this.abortController = new AbortController();

        // Construct the actual connection URL
        const connectionUrl = proxyConfig.enabled ? proxyConfig.prefix + sseUrl : sseUrl;

        // Use fetch instead of EventSource to support headers
        const response = await fetch(connectionUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                ...this.headers
            },
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const msg = `Connection failed: ${response.status} ${response.statusText}`;
            this.emitError(msg);
            reject(new Error(msg));
            return;
        }

        if (!response.body) {
            reject(new Error('No response body received from SSE endpoint'));
            return;
        }

        // Start reading the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // We resolve the promise only when we receive the 'endpoint' event
        this.readSseStream(reader, decoder, resolve, reject);

      } catch (err: any) {
        if (err.name === 'AbortError') {
            // Ignore abort errors on disconnect
        } else {
            reject(err);
        }
      }
    });
  }

  private async readSseStream(
      reader: ReadableStreamDefaultReader<Uint8Array>, 
      decoder: TextDecoder,
      resolve: () => void,
      reject: (reason?: any) => void
  ) {
      let buffer = '';
      let resolved = false;

      try {
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              // Process buffer for events (separated by double newline)
              // We split by \n\n to separate events
              const parts = buffer.split(/\n\n/);
              
              // The last part is either empty (if buffer ended with \n\n) or incomplete
              // Keep it in the buffer for the next chunk
              buffer = parts.pop() || '';

              for (const part of parts) {
                  if (!part.trim()) continue;
                  
                  const lines = part.split('\n');
                  let eventType = 'message';
                  let data = '';

                  for (const line of lines) {
                      if (line.startsWith('event: ')) {
                          eventType = line.substring(7).trim();
                      } else if (line.startsWith('data: ')) {
                          // Standard SSE: concatenate data lines. 
                          // JSON content usually doesn't care about missing newlines between data lines 
                          // unless strings are split across lines, which we assume JSON stringify doesn't do aggressively.
                          data += line.substring(6);
                      }
                  }

                  if (eventType === 'endpoint') {
                      try {
                          const url = data.trim();
                          const resolvedUrl = new URL(url, this.originalSseUrl).toString();

                          if (this.proxyConfig.enabled) {
                              this.postUrl = this.proxyConfig.prefix + resolvedUrl;
                          } else {
                              this.postUrl = resolvedUrl;
                          }
                          console.log('MCP Post Endpoint received:', this.postUrl);
                          
                          if (!resolved) {
                              resolved = true;
                              resolve();
                          }
                      } catch (e) {
                          this.emitError(`Invalid endpoint URL: ${data}`);
                          if (!resolved) reject(e);
                      }
                  } else if (eventType === 'message') {
                      try {
                          if (data) {
                            const json = JSON.parse(data);
                            this.handleIncomingMessage(json);
                          }
                      } catch (e) {
                          console.error("Failed to parse SSE message", data);
                      }
                  }
              }
          }
      } catch (error: any) {
          if (error.name !== 'AbortError') {
              this.emitError(`Stream error: ${error.message}`);
              if (!resolved) reject(error);
          }
      } finally {
          try {
             reader.releaseLock();
          } catch(e) {}
      }
  }

  disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.postUrl = null;
    this.pendingRequests.clear();
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
  }

  private emitError(msg: string) {
    this.errorHandlers.forEach(h => h(msg));
  }

  private handleIncomingMessage(data: JsonRpcMessage) {
    this.messageHandlers.forEach(h => h(data));

    // If it's a response to a request we sent
    if ('id' in data && data.id !== undefined && data.id !== null) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        if ('result' in (data as JsonRpcResponse)) {
          pending.resolve((data as JsonRpcResponse).result);
        } else if ('error' in (data as JsonRpcResponse)) {
          pending.reject((data as JsonRpcResponse).error);
        }
        this.pendingRequests.delete(data.id);
      }
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.postUrl) {
      throw new Error("Not connected or POST endpoint not received yet.");
    }

    const id = this.requestCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    // Log the outgoing request locally
    this.messageHandlers.forEach(h => h(request)); // Loop back so UI sees it

    // Setup pending promise
    const responsePromise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      // Timeout safety
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timed out"));
        }
      }, 30000);
    });

    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers // Inject custom headers
        },
        body: JSON.stringify(request)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }
      
    } catch (e: any) {
      this.pendingRequests.delete(id);
      throw e;
    }

    return responsePromise;
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.postUrl) {
      throw new Error("Not connected or POST endpoint not received yet.");
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    // Log the outgoing notification locally
    this.messageHandlers.forEach(h => h(notification));

    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers // Inject custom headers
        },
        body: JSON.stringify(notification)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }
      
    } catch (e: any) {
      throw e;
    }
  }
}
