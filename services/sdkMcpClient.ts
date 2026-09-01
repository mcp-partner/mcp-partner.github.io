import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  withInputRequired,
  type JSONRPCMessage,
  type MessageExtraInfo,
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/client';
import { ResultSchema } from '@modelcontextprotocol/core';
import { APP_VERSION } from '../constants';
import type { JsonRpcMessage } from '../types';
import type {
  ErrorHandler,
  IMcpClient,
  McpConnectionInfo,
  MessageHandler,
  ProxyConfig,
  Unsubscribe,
} from './mcpClient';
import { createProxyFetch, resolveMcpUrl } from './proxyFetch';

type SdkTransportType = McpConnectionInfo['transport'];

/** Adds wire logging without reimplementing either MCP transport. */
class LoggingTransport implements Transport {
  readonly hasPerRequestStream?: boolean;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;

  constructor(
    private readonly inner: Transport,
    private readonly transportType: SdkTransportType,
    private readonly logMessage: MessageHandler,
  ) {
    this.hasPerRequestStream = inner.hasPerRequestStream;
    inner.onclose = () => this.onclose?.();
    inner.onerror = (error) => this.onerror?.(error);
    inner.onmessage = (message, extra) => {
      this.logMessage(message as JsonRpcMessage, {
        direction: 'in',
        source: `official-sdk:${this.transportType}`,
      });
      this.onmessage?.(message, extra);
    };
  }

  get sessionId(): string | undefined {
    return this.inner.sessionId;
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    this.logMessage(message as JsonRpcMessage, {
      direction: 'out',
      source: `official-sdk:${this.transportType}`,
    });
    return this.inner.send(message, options);
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }

  setSupportedProtocolVersions(versions: string[]): void {
    this.inner.setSupportedProtocolVersions?.(versions);
  }
}

export class SdkMcpClient implements IMcpClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly errorHandlers = new Set<ErrorHandler>();
  private connecting = false;

  constructor(private readonly transportType: SdkTransportType) {}

  async connect(
    url: string,
    proxyConfig: ProxyConfig = { enabled: false, prefix: '' },
    headers: Record<string, string> = {},
  ): Promise<void> {
    await this.closeConnection();
    this.connecting = true;

    try {
      const endpoint = resolveMcpUrl(url);
      const proxyFetch = createProxyFetch(proxyConfig);
      const rawTransport: Transport = this.transportType === 'streamable_http'
        ? new StreamableHTTPClientTransport(endpoint, {
            fetch: proxyFetch,
            requestInit: { headers },
          })
        : new SSEClientTransport(endpoint, {
            fetch: proxyFetch,
            requestInit: { headers },
          });

      const transport = new LoggingTransport(
        rawTransport,
        this.transportType,
        (message, meta) => this.emitMessage(message, meta),
      );

      transport.onerror = (error) => {
        // A failed modern probe is expected when auto-negotiation falls back
        // to a 2025-era server. Only surface transport errors after connect;
        // a terminal connect failure is emitted once by the catch block.
        if (!this.connecting) {
          this.emitError(error.message);
        }
      };

      const client = new Client(
        {
          name: 'mcp-partner-web',
          version: APP_VERSION,
        },
        {
          capabilities: {},
          versionNegotiation: this.transportType === 'streamable_http'
            ? { mode: 'auto' }
            : { mode: 'legacy' },
          // MCP Partner is an inspector. Surface 2026 input_required results
          // to the UI instead of attempting interactions it cannot answer yet.
          inputRequired: { autoFulfill: false },
        },
      );

      this.client = client;
      this.transport = transport;
      await client.connect(transport);
    } catch (error) {
      await this.closeConnection();
      const normalized = error instanceof Error ? error : new Error(String(error));
      throw normalized;
    } finally {
      this.connecting = false;
    }
  }

  disconnect(): void {
    void this.closeConnection();
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const client = this.requireClient();

    switch (method) {
      case 'tools/list':
        return client.listTools(params);
      case 'tools/call':
        return client.callTool(params, { allowInputRequired: true } as any);
      case 'resources/list':
        return client.listResources(params);
      case 'resources/read':
        return client.readResource(params, { allowInputRequired: true } as any);
      case 'prompts/list':
        return client.listPrompts(params);
      case 'prompts/get':
        return client.getPrompt(params, { allowInputRequired: true } as any);
      default:
        return client.request(
          { method, params } as any,
          withInputRequired(ResultSchema),
          { allowInputRequired: true },
        );
    }
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    await this.requireClient().notification({ method, params } as any);
  }

  getConnectionInfo(): McpConnectionInfo | null {
    if (!this.client) {
      return null;
    }

    const serverInfo = this.client.getServerVersion();
    return {
      transport: this.transportType,
      protocolEra: this.client.getProtocolEra(),
      protocolVersion: this.client.getNegotiatedProtocolVersion(),
      ...(serverInfo ? { serverInfo } : {}),
    };
  }

  onMessage(handler: MessageHandler): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('MCP client is not connected.');
    }
    return this.client;
  }

  private emitMessage(message: JsonRpcMessage, meta?: any): void {
    this.messageHandlers.forEach((handler) => handler(message, meta));
  }

  private emitError(message: string): void {
    this.errorHandlers.forEach((handler) => handler(message));
  }

  private async closeConnection(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;

    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.warn('Failed to close MCP SDK client cleanly:', error);
      }
      return;
    }

    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.warn('Failed to close MCP transport cleanly:', error);
      }
    }
  }
}
