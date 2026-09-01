import { describe, expect, it, vi } from 'vitest';
import vercelFunction, { createCorsProxyHandler, handler, isPrivateOrReservedIp } from './cors';

const APP_ORIGIN = 'https://partner.example';
const PUBLIC_IP = '93.184.216.34';

const proxyRequest = (
  target: string,
  init: RequestInit = {},
): Request => new Request(
  `${APP_ORIGIN}/cors?url=${encodeURIComponent(target)}`,
  {
    ...init,
    headers: {
      Origin: APP_ORIGIN,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  },
);

const createHandler = (
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined> = {},
  addresses: string[] = [PUBLIC_IP],
) => createCorsProxyHandler({
  fetch: fetchImpl,
  env,
  resolveHostname: async () => addresses,
});

describe('Vercel MCP CORS proxy', () => {
  it('exports the Web Handler shape expected by Vercel', () => {
    expect(vercelFunction.fetch).toBe(handler);
  });

  it('answers an allowed CORS preflight without requiring a target URL', async () => {
    const handler = createHandler(vi.fn() as unknown as typeof fetch);
    const response = await handler(new Request(`${APP_ORIGIN}/cors`, {
      method: 'OPTIONS',
      headers: {
        Origin: APP_ORIGIN,
        'Access-Control-Request-Headers': 'authorization, mcp-protocol-version',
      },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('access-control-allow-headers')).toContain('mcp-protocol-version');
    expect(response.headers.get('x-mcp-proxy')).toBe('mcp-partner');
  });

  it('supports the same-origin capability probe used on Vercel custom domains', async () => {
    const handler = createHandler(vi.fn() as unknown as typeof fetch);
    const response = await handler(new Request(`${APP_ORIGIN}/cors`, {
      method: 'OPTIONS',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('x-mcp-proxy')).toBe('mcp-partner');
  });

  it('forwards MCP headers and streams the upstream response', async () => {
    const fetchSpy = vi.fn(async (_target: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('mcp-protocol-version')).toBe('2026-07-28');
      expect(headers.get('mcp-method')).toBe('tools/list');
      expect(headers.get('authorization')).toBe('Bearer upstream-secret');
      expect(headers.has('x-mcp-proxy-token')).toBe(false);

      return new Response('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Content-Encoding': 'gzip',
          'Mcp-Session-Id': 'legacy-session',
        },
      });
    });
    const handler = createHandler(fetchSpy as unknown as typeof fetch);
    const target = 'https://mcp.example/mcp?tenant=a&stream=1';
    const response = await handler(proxyRequest(target, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer upstream-secret',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/list',
        'X-MCP-Proxy-Token': 'must-not-reach-upstream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0][0])).toBe(target);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('mcp-session-id')).toBe('legacy-session');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(await response.text()).toContain('event: message');
  });

  it('blocks literal and DNS-resolved private targets', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const literalHandler = createHandler(fetchMock);
    const literalResponse = await literalHandler(proxyRequest('http://127.0.0.1:3000/mcp'));

    expect(literalResponse.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    const dnsHandler = createHandler(fetchMock, {}, ['10.0.0.7']);
    const dnsResponse = await dnsHandler(proxyRequest('https://rebind.example/mcp'));
    expect(dnsResponse.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates every redirect before following it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 307,
      headers: { Location: 'http://169.254.169.254/latest/meta-data' },
    })) as unknown as typeof fetch;
    const handler = createHandler(fetchMock);
    const response = await handler(proxyRequest('https://mcp.example/redirect'));

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('removes upstream authorization before a cross-origin redirect', async () => {
    const seenAuthorization: Array<string | null> = [];
    const fetchMock = vi.fn(async (_target: RequestInfo | URL, init?: RequestInit) => {
      seenAuthorization.push(new Headers(init?.headers).get('authorization'));
      return seenAuthorization.length === 1
        ? new Response(null, {
            status: 307,
            headers: { Location: 'https://second.example/mcp' },
          })
        : new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const handler = createHandler(fetchMock);
    const response = await handler(proxyRequest('https://first.example/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer upstream-secret',
        'Content-Type': 'application/json',
      },
      body: '{}',
    }));

    expect(response.status).toBe(200);
    expect(seenAuthorization).toEqual(['Bearer upstream-secret', null]);
  });

  it('rejects oversized JSON-RPC request bodies before contacting upstream', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const handler = createHandler(fetchMock, { MCP_PROXY_MAX_BODY_BYTES: '1024' });
    const response = await handler(proxyRequest('https://mcp.example/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(1025),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports host allowlists and an optional proxy access token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
    const handler = createHandler(fetchMock, {
      MCP_PROXY_ALLOWED_HOSTS: '*.example.com',
      MCP_PROXY_TOKEN: 'proxy-secret',
    });

    const missingToken = await handler(proxyRequest('https://mcp.example.com/mcp'));
    expect(missingToken.status).toBe(401);

    const allowed = await handler(proxyRequest('https://mcp.example.com/mcp', {
      headers: { 'X-MCP-Proxy-Token': 'proxy-secret' },
    }));
    expect(allowed.status).toBe(200);

    const blockedHost = await handler(proxyRequest('https://not-example.net/mcp', {
      headers: { 'X-MCP-Proxy-Token': 'proxy-secret' },
    }));
    expect(blockedHost.status).toBe(403);
  });
});

describe('proxy IP policy', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it.each([PUBLIC_IP, '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isPrivateOrReservedIp(address)).toBe(false);
    },
  );
});
