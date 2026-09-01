import type { FetchLike } from '@modelcontextprotocol/client';
import type { ProxyConfig } from './mcpClient';

const URL_PLACEHOLDER = '{url}';

/**
 * Builds a proxy URL without letting the target URL's query string leak into
 * the proxy's own query parameters. A custom prefix may contain `{url}`;
 * otherwise the encoded target is appended to the prefix.
 */
export const buildProxyUrl = (prefix: string, target: string | URL): string => {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix) {
    throw new Error('CORS proxy is enabled, but its URL prefix is empty.');
  }

  const encodedTarget = encodeURIComponent(target.toString());
  return normalizedPrefix.includes(URL_PLACEHOLDER)
    ? normalizedPrefix.replaceAll(URL_PLACEHOLDER, encodedTarget)
    : `${normalizedPrefix}${encodedTarget}`;
};

/**
 * Keeps the MCP endpoint as the transport's logical URL and only rewrites the
 * actual fetch destination. This is important for legacy SSE: the official
 * SDK validates that the server-provided POST endpoint has the same origin as
 * the SSE endpoint before this fetch adapter sends both through the proxy.
 */
export const createProxyFetch = (
  proxyConfig: ProxyConfig,
  baseFetch: FetchLike = globalThis.fetch.bind(globalThis),
): FetchLike => {
  if (!proxyConfig.enabled) {
    return baseFetch;
  }

  return (target, init) => baseFetch(buildProxyUrl(proxyConfig.prefix, target), init);
};

export const resolveMcpUrl = (value: string): URL => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('MCP server URL is required.');
  }

  const baseUrl = typeof window === 'undefined' ? undefined : window.location.href;
  const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MCP browser transports require an http:// or https:// URL.');
  }

  return url;
};
