import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonRpcMessage } from '../types';
import { SseMcpClient } from './sseMcpClient';
import { StreamableHttpMcpClient } from './streamableHttpMcpClient';

const ENDPOINT = 'https://mcp.example/mcp';

const parseMessage = (init?: RequestInit): any => JSON.parse(String(init?.body));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('official SDK Streamable HTTP integration', () => {
  it('negotiates and speaks the modern 2026-07-28 protocol', async () => {
    const requests: Array<{ message: any; headers: Headers }> = [];
    const fetchMock = vi.fn(async (_target: RequestInfo | URL, init?: RequestInit) => {
      const message = parseMessage(init);
      const headers = new Headers(init?.headers);
      requests.push({ message, headers });

      if (message.method === 'server/discover') {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            supportedVersions: ['2026-07-28'],
            capabilities: { tools: {} },
            _meta: {
              'io.modelcontextprotocol/serverInfo': {
                name: 'modern-test-server',
                version: '1.0.0',
              },
            },
          },
        });
      }

      if (message.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            resultType: 'complete',
            tools: [],
            ttlMs: 0,
            cacheScope: 'private',
          },
        });
      }

      throw new Error(`Unexpected method: ${message.method}`);
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const client = new StreamableHttpMcpClient();
    const wireMessages: Array<{ message: JsonRpcMessage; direction?: string }> = [];
    client.onMessage((message, meta) => wireMessages.push({ message, direction: meta?.direction }));

    await client.connect(ENDPOINT, { enabled: false, prefix: '' }, {});
    const list = await client.sendRequest('tools/list');

    expect(list.tools).toEqual([]);
    expect(client.getConnectionInfo()).toMatchObject({
      transport: 'streamable_http',
      protocolEra: 'modern',
      protocolVersion: '2026-07-28',
      serverInfo: { name: 'modern-test-server', version: '1.0.0' },
    });
    expect(requests.map(({ message }) => message.method)).toEqual([
      'server/discover',
      'tools/list',
    ]);
    expect(requests[0].headers.get('mcp-protocol-version')).toBe('2026-07-28');
    expect(requests[1].headers.get('mcp-method')).toBe('tools/list');
    expect(requests[1].message.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
    expect(wireMessages.some(({ direction }) => direction === 'out')).toBe(true);
    expect(wireMessages.some(({ direction }) => direction === 'in')).toBe(true);

    client.disconnect();
  });

  it('falls back to the 2025 initialize flow for a legacy Streamable HTTP server', async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_target: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return new Response(null, { status: 405, statusText: 'Method Not Allowed' });
      }

      const message = parseMessage(init);
      methods.push(message.method);

      if (message.method === 'server/discover') {
        return new Response('legacy server', { status: 400 });
      }
      if (message.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'legacy-test-server', version: '1.0.0' },
          },
        });
      }
      if (message.method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
      }
      if (message.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: [] },
        });
      }

      throw new Error(`Unexpected method: ${message.method}`);
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const client = new StreamableHttpMcpClient();
    await client.connect(ENDPOINT, { enabled: false, prefix: '' }, {});
    await client.sendRequest('tools/list');

    expect(client.getConnectionInfo()).toMatchObject({
      protocolEra: 'legacy',
      protocolVersion: '2025-11-25',
      serverInfo: { name: 'legacy-test-server' },
    });
    expect(methods).toEqual([
      'server/discover',
      'initialize',
      'notifications/initialized',
      'tools/list',
    ]);

    client.disconnect();
  });

  it('keeps message subscriptions when reconnecting the same client instance', async () => {
    const fetchMock = vi.fn(async (_target: RequestInfo | URL, init?: RequestInit) => {
      const message = parseMessage(init);
      if (message.method === 'server/discover') {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          result: { supportedVersions: ['2026-07-28'], capabilities: {} },
        });
      }
      throw new Error(`Unexpected method: ${message.method}`);
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const client = new StreamableHttpMcpClient();
    const listener = vi.fn();
    client.onMessage(listener);

    await client.connect(ENDPOINT, { enabled: false, prefix: '' }, {});
    const firstConnectMessages = listener.mock.calls.length;
    await client.connect(ENDPOINT, { enabled: false, prefix: '' }, {});

    expect(firstConnectMessages).toBeGreaterThan(0);
    expect(listener.mock.calls.length).toBeGreaterThan(firstConnectMessages);
    client.disconnect();
  });
});

describe('official SDK legacy HTTP+SSE integration', () => {
  it('keeps logical endpoint validation intact while proxying both SSE URLs', async () => {
    const encoder = new TextEncoder();
    let eventController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const physicalTargets: string[] = [];

    const emitMessage = (message: unknown) => {
      eventController?.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`));
    };

    const fetchMock = vi.fn(async (target: RequestInfo | URL, init?: RequestInit) => {
      const physicalTarget = String(target);
      physicalTargets.push(physicalTarget);
      const proxiedUrl = new URL(physicalTarget, 'https://partner.example');
      const logicalTarget = proxiedUrl.searchParams.get('url');

      if (logicalTarget === 'https://mcp.example/sse') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            eventController = controller;
            controller.enqueue(encoder.encode(
              'event: endpoint\ndata: https://mcp.example/messages?session=legacy\n\n',
            ));
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (logicalTarget === 'https://mcp.example/messages?session=legacy') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer legacy-token');
        const message = parseMessage(init);
        if (message.method === 'initialize') {
          emitMessage({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'sse-test-server', version: '1.0.0' },
            },
          });
        } else if (message.method === 'tools/list') {
          emitMessage({ jsonrpc: '2.0', id: message.id, result: { tools: [] } });
        }
        return new Response(null, { status: 202 });
      }

      throw new Error(`Unexpected physical target: ${physicalTarget}`);
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const client = new SseMcpClient();
    await client.connect(
      'https://mcp.example/sse',
      { enabled: true, prefix: '/cors?url=' },
      { Authorization: 'Bearer legacy-token' },
    );
    const tools = await client.sendRequest('tools/list');

    expect(tools.tools).toEqual([]);
    expect(client.getConnectionInfo()).toMatchObject({
      transport: 'sse',
      protocolEra: 'legacy',
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'sse-test-server' },
    });
    expect(physicalTargets).toContain(
      `/cors?url=${encodeURIComponent('https://mcp.example/sse')}`,
    );
    expect(physicalTargets).toContain(
      `/cors?url=${encodeURIComponent('https://mcp.example/messages?session=legacy')}`,
    );

    client.disconnect();
  });
});
