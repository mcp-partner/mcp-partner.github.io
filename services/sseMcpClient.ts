
import { JsonRpcMessage, JsonRpcResponse, JsonRpcRequest, JsonRpcNotification } from '../types';
import { IMcpClient, ProxyConfig, MessageHandler, ErrorHandler, Unsubscribe } from './mcpClient';
import { ListToolsResultSchema, CallToolResultSchema, ListResourcesResultSchema, ListPromptsResultSchema, GetPromptResultSchema, ReadResourceResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export class SseMcpClient implements IMcpClient {
  private abortController: AbortController | null = null;
  private postUrl: string | null = null;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private pendingRequests: Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void; validator?: z.ZodSchema<any> }> = new Map();
  private requestCounter = 0;
  
  private proxyConfig: ProxyConfig = { enabled: false, prefix: '' };
  private originalSseUrl: string = '';
  private headers: Record<string, string> = {};
  private sessionId: string | null = null;

  constructor() {}

  connect(sseUrl: string, proxyConfig: ProxyConfig = { enabled: false, prefix: '' }, headers: Record<string, string> = {}): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.proxyConfig = proxyConfig;
        this.originalSseUrl = sseUrl;
        this.headers = headers;
        this.sessionId = null;

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
        
        // Capture session ID from GET response if present (some servers assign it on connection)
        const sessId = response.headers.get('Mcp-Session-Id');
        if (sessId) {
            this.sessionId = sessId;
            console.log('[SSE] Session ID captured from GET response:', sessId);
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
            reject(new Error('Connection aborted'));
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
              
              // Robust parsing loop to handle various line endings (CRLF, LF, CR)
              // Standard SSE events are separated by a pair of newlines.
              while (true) {
                  const match = buffer.match(/(\n\n|\r\n\r\n|\r\r)/);
                  
                  if (!match || match.index === undefined) {
                      break;
                  }

                  const eventBlock = buffer.substring(0, match.index);
                  buffer = buffer.substring(match.index + match[0].length);

                  if (!eventBlock.trim()) {
                      continue;
                  }

                  const lines = eventBlock.split(/\r\n|\r|\n/);
                  let eventType = 'message';
                  let data = '';

                  for (const line of lines) {
                      if (line.startsWith('event:')) {
                          eventType = line.substring(6).trim();
                      } 
                      else if (line.startsWith('data:')) {
                          let d = line.substring(5);
                          if (d.startsWith(' ')) d = d.substring(1);
                          data += d;
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
                          console.error("Endpoint parsing error", e);
                          this.emitError(`Invalid endpoint URL: ${data}`);
                          if (!resolved) reject(e);
                      }
                  } else if (eventType === 'message') {
                      try {
                          if (data) {
                            const json = JSON.parse(data);
                            this.handleIncomingMessage(json, { source: 'sse' });
                          }
                      } catch (e) {
                          console.error("Failed to parse SSE message JSON", e, data);
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
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.sessionId = null;
  }

  onMessage(handler: MessageHandler): Unsubscribe {
    this.messageHandlers.push(handler);
    return () => {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onError(handler: ErrorHandler): Unsubscribe {
    this.errorHandlers.push(handler);
    return () => {
        this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    };
  }

  private emitError(msg: string) {
    this.errorHandlers.forEach(h => h(msg));
  }

  private handleIncomingMessage(data: JsonRpcMessage, meta?: any) {
    this.messageHandlers.forEach(h => h(data, meta));

    if ('id' in data && data.id !== undefined && data.id !== null) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        if ('result' in (data as JsonRpcResponse)) {
          let result = (data as JsonRpcResponse).result;
          // Apply schema validation if a validator was registered for this request
          if (pending.validator) {
              try {
                  result = pending.validator.parse(result);
              } catch (e) {
                  console.error(`SSE Response Validation Error for request ${data.id}:`, e);
                  pending.reject(e);
                  this.pendingRequests.delete(data.id);
                  return;
              }
          }
          pending.resolve(result);
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

    // Determine appropriate validator for the expected response
    let validator: z.ZodSchema<any> | undefined;
    switch (method) {
        case 'tools/list': validator = ListToolsResultSchema; break;
        case 'tools/call': validator = CallToolResultSchema; break;
        case 'resources/list': validator = ListResourcesResultSchema; break;
        case 'resources/read': validator = ReadResourceResultSchema; break;
        case 'prompts/list': validator = ListPromptsResultSchema; break;
        case 'prompts/get': validator = GetPromptResultSchema; break;
    }

    const id = this.requestCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    this.messageHandlers.forEach(h => h(request));

    const responsePromise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, validator });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timed out"));
        }
      }, 30000);
    });

    try {
      const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json', 
          ...this.headers 
      };
      if (this.sessionId) {
          reqHeaders['Mcp-Session-Id'] = this.sessionId;
      }

      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(request)
      });

      const sessId = res.headers.get('Mcp-Session-Id');
      if (sessId) {
          this.sessionId = sessId;
          console.log('[SSE] Session ID updated from POST response:', sessId);
      }

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

    this.messageHandlers.forEach(h => h(notification));

    try {
      const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          ...this.headers 
      };
      if (this.sessionId) {
          reqHeaders['Mcp-Session-Id'] = this.sessionId;
      } else {
          console.warn('[SSE] Sending notification without Session ID. Server may reject if initialized.');
      }

      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(notification)
      });

      const sessId = res.headers.get('Mcp-Session-Id');
      if (sessId) {
          this.sessionId = sessId;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }
      
    } catch (e: any) {
      throw e;
    }
  }
}
