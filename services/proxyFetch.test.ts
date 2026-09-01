import { describe, expect, it, vi } from 'vitest';
import { buildProxyUrl, createProxyFetch, resolveMcpUrl } from './proxyFetch';

describe('proxy fetch adapter', () => {
  it('encodes the complete target URL, including its own query string', () => {
    const target = 'https://mcp.example/mcp?token=a&mode=stream';
    expect(buildProxyUrl('/cors?url=', target)).toBe(
      `/cors?url=${encodeURIComponent(target)}`,
    );
  });

  it('supports an explicit {url} placeholder', () => {
    const target = 'https://mcp.example/sse';
    expect(buildProxyUrl('https://proxy.example/fetch/{url}?debug=1', target)).toBe(
      `https://proxy.example/fetch/${encodeURIComponent(target)}?debug=1`,
    );
  });

  it('rewrites only the physical fetch destination', async () => {
    const baseFetch = vi.fn(async () => new Response('ok'));
    const proxyFetch = createProxyFetch(
      { enabled: true, prefix: '/cors?url=' },
      baseFetch,
    );
    const target = new URL('https://mcp.example/messages?session=abc&part=2');

    await proxyFetch(target, { method: 'POST' });

    expect(baseFetch).toHaveBeenCalledWith(
      `/cors?url=${encodeURIComponent(target.toString())}`,
      { method: 'POST' },
    );
  });

  it('rejects browser-incompatible endpoint schemes', () => {
    expect(() => resolveMcpUrl('file:///tmp/server')).toThrow(/http:\/\/ or https:\/\//);
  });
});
