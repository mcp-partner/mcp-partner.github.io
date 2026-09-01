import { timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE', 'OPTIONS']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const PROXY_TOKEN_HEADER = 'x-mcp-proxy-token';

const REQUEST_HEADERS_TO_DROP = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'origin',
  'proxy-authorization',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  PROXY_TOKEN_HEADER,
]);

const RESPONSE_HEADERS_TO_DROP = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'set-cookie',
  'set-cookie2',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type ProxyEnvironment = Record<string, string | undefined>;
type ResolveHostname = (hostname: string) => Promise<string[]>;

export interface CorsProxyDependencies {
  fetch: typeof globalThis.fetch;
  resolveHostname: ResolveHostname;
  env: ProxyEnvironment;
}

class ProxyRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const splitCsv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const readBoundedInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const stripIpv6Brackets = (hostname: string): string =>
  hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

const parseIpv4 = (address: string): number[] | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const values = parts.map((part) => Number(part));
  return values.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? values
    : null;
};

const parseIpv6 = (address: string): number[] | null => {
  let normalized = stripIpv6Brackets(address.toLowerCase()).split('%', 1)[0];

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (lastColon < 0 || !ipv4) return null;
    normalized = `${normalized.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const parts = [...left, ...Array(missing).fill('0'), ...right];
  const values = parts.map((part) => Number.parseInt(part, 16));
  return values.length === 8
    && parts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))
    && values.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? values
    : null;
};

const isPrivateOrReservedIpv4 = (address: string): boolean => {
  const parts = parseIpv4(address);
  if (!parts) return true;
  const [a, b, c] = parts;

  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
};

const isPrivateOrReservedIpv6 = (address: string): boolean => {
  const parts = parseIpv6(address);
  if (!parts) return true;

  const isIpv4Mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (isIpv4Mapped) {
    const mapped = `${parts[6] >> 8}.${parts[6] & 0xff}.${parts[7] >> 8}.${parts[7] & 0xff}`;
    return isPrivateOrReservedIpv4(mapped);
  }

  const isUnspecifiedOrLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] <= 1;
  const isDocumentation = parts[0] === 0x2001 && parts[1] === 0x0db8;
  const isBenchmark = parts[0] === 0x2001 && parts[1] === 0x0002;
  const isSixToFour = parts[0] === 0x2002;
  const isGlobalUnicast = (parts[0] & 0xe000) === 0x2000;

  return isUnspecifiedOrLoopback
    || isDocumentation
    || isBenchmark
    || isSixToFour
    || !isGlobalUnicast;
};

export const isPrivateOrReservedIp = (address: string): boolean => {
  const normalized = stripIpv6Brackets(address);
  const version = isIP(normalized);
  if (version === 4) return isPrivateOrReservedIpv4(normalized);
  if (version === 6) return isPrivateOrReservedIpv6(normalized);
  return true;
};

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost'
    || normalized === 'instance-data'
    || normalized === 'metadata.google.internal'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.lan')
    || normalized.endsWith('.home');
};

const hostnameMatches = (hostname: string, pattern: string): boolean => {
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, '');
  const normalizedPattern = pattern.toLowerCase().replace(/\.$/, '');
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.endsWith(suffix) && normalizedHost.length > suffix.length;
  }
  return normalizedHost === normalizedPattern;
};

const validateTargetUrl = (
  target: URL,
  requestOrigin: string,
  allowedHosts: string[],
): void => {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new ProxyRequestError(400, 'Only http:// and https:// target URLs are supported.');
  }
  if (target.username || target.password) {
    throw new ProxyRequestError(400, 'Target URLs must not contain embedded credentials.');
  }
  if (!target.hostname || isBlockedHostname(target.hostname)) {
    throw new ProxyRequestError(403, 'Local and private target hostnames are blocked.');
  }
  if (target.origin === requestOrigin) {
    throw new ProxyRequestError(403, 'Proxying back to this deployment is blocked.');
  }
  if (allowedHosts.length > 0 && !allowedHosts.some((pattern) => hostnameMatches(target.hostname, pattern))) {
    throw new ProxyRequestError(403, 'The target host is not in MCP_PROXY_ALLOWED_HOSTS.');
  }

  const literalIp = stripIpv6Brackets(target.hostname);
  if (isIP(literalIp) && isPrivateOrReservedIp(literalIp)) {
    throw new ProxyRequestError(403, 'Private, loopback, link-local, and reserved IP targets are blocked.');
  }
};

const validateResolvedAddresses = async (
  target: URL,
  resolveHostname: ResolveHostname,
): Promise<string[]> => {
  const hostname = stripIpv6Brackets(target.hostname);
  if (isIP(hostname)) return [hostname];

  const addresses = await resolveHostname(hostname);
  if (addresses.length === 0) {
    throw new ProxyRequestError(502, 'The target hostname did not resolve to an IP address.');
  }
  if (addresses.some(isPrivateOrReservedIp)) {
    throw new ProxyRequestError(403, 'The target hostname resolves to a private or reserved IP address.');
  }
  return addresses;
};

/**
 * Connects to one of the IPs that was just validated while retaining the
 * original hostname for Host, TLS SNI, and certificate verification. This
 * closes the DNS-rebinding gap between a separate lookup and a normal fetch.
 */
const fetchWithPinnedAddress = (
  target: URL,
  init: RequestInit,
  addresses: string[],
): Promise<Response> => new Promise((resolve, reject) => {
  const address = addresses.find((candidate) => isIP(candidate) === 4) ?? addresses[0];
  const family = isIP(address);
  if (!address || (family !== 4 && family !== 6)) {
    reject(new ProxyRequestError(502, 'No validated upstream address is available.'));
    return;
  }

  const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const request = requestImpl(target, {
    method: init.method,
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    signal: init.signal ?? undefined,
    lookup: ((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
      callback(null, address, family);
    }) as any,
  }, (upstream) => {
    const status = upstream.statusCode ?? 502;
    const responseHeaders = new Headers();
    Object.entries(upstream.headers).forEach(([name, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => responseHeaders.append(name, item));
      } else if (value !== undefined) {
        responseHeaders.set(name, String(value));
      }
    });

    const bodyless = status === 204 || status === 205 || status === 304;
    const body = bodyless ? null : Readable.toWeb(upstream) as ReadableStream<Uint8Array>;
    resolve(new Response(body, {
      status,
      statusText: upstream.statusMessage,
      headers: responseHeaders,
    }));
  });

  request.once('error', reject);
  if (init.body instanceof ArrayBuffer) {
    request.end(Buffer.from(init.body));
  } else if (ArrayBuffer.isView(init.body)) {
    request.end(Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength));
  } else if (init.body == null) {
    request.end();
  } else {
    request.destroy();
    reject(new ProxyRequestError(500, 'Unsupported internal proxy request body type.'));
  }
});

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isOriginAllowed = (
  origin: string | null,
  requestOrigin: string,
  configuredOrigins: string[],
): boolean => {
  if (!origin) return false;
  if (configuredOrigins.includes('*')) return true;
  if (configuredOrigins.length === 0) return normalizeOrigin(origin) === requestOrigin;
  const normalized = normalizeOrigin(origin);
  return normalized !== null
    && configuredOrigins.some((allowed) => normalizeOrigin(allowed) === normalized);
};

const tokensEqual = (actual: string | null, expected: string): boolean => {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

const createCorsHeaders = (
  request: Request,
  originAllowed: boolean,
): Headers => {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Retry-After, WWW-Authenticate, X-MCP-Proxy',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin, Access-Control-Request-Headers',
    'X-Content-Type-Options': 'nosniff',
    'X-MCP-Proxy': 'mcp-partner',
  });

  const origin = request.headers.get('origin');
  if (origin && originAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  const requestedHeaders = splitCsv(request.headers.get('access-control-request-headers') ?? undefined)
    .filter((header) => /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(header));
  headers.set(
    'Access-Control-Allow-Headers',
    requestedHeaders.length > 0
      ? requestedHeaders.join(', ')
      : 'Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, X-MCP-Proxy-Token',
  );

  return headers;
};

const jsonError = (message: string, status: number, headers: Headers): Response =>
  Response.json({ error: message }, { status, headers });

const copyRequestHeaders = (request: Request): Headers => {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (
      !REQUEST_HEADERS_TO_DROP.has(normalized)
      && !normalized.startsWith('sec-fetch-')
      && !normalized.startsWith('x-forwarded-')
      && !normalized.startsWith('x-vercel-')
    ) {
      headers.set(key, value);
    }
  });
  headers.set('User-Agent', 'mcp-partner-vercel-proxy/1.0');
  return headers;
};

const addVary = (headers: Headers, value: string): void => {
  const values = splitCsv(headers.get('vary') ?? undefined);
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value);
  }
  headers.set('Vary', values.join(', '));
};

const createResponseHeaders = (upstream: Headers, corsHeaders: Headers): Headers => {
  const headers = new Headers(upstream);
  for (const key of [...headers.keys()]) {
    const normalized = key.toLowerCase();
    if (RESPONSE_HEADERS_TO_DROP.has(normalized) || normalized.startsWith('access-control-')) {
      headers.delete(key);
    }
  }
  corsHeaders.forEach((value, key) => headers.set(key, value));
  addVary(headers, 'Origin');
  addVary(headers, 'Access-Control-Request-Headers');

  if (headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    headers.set('X-Accel-Buffering', 'no');
  }
  return headers;
};

const defaultResolveHostname: ResolveHostname = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

export const createCorsProxyHandler = (
  overrides: Partial<CorsProxyDependencies> = {},
) => {
  const fetchOverride = overrides.fetch;
  const resolveHostname = overrides.resolveHostname ?? defaultResolveHostname;
  const env = overrides.env ?? process.env;

  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    const requestOrigin = requestUrl.origin;
    const configuredOrigins = splitCsv(env.MCP_PROXY_ALLOWED_ORIGINS);
    const requestOriginHeader = request.headers.get('origin');
    const originAllowed = isOriginAllowed(requestOriginHeader, requestOrigin, configuredOrigins);
    const isSameOriginBrowserRequest = request.headers.get('sec-fetch-site') === 'same-origin';
    const proxyToken = env.MCP_PROXY_TOKEN?.trim();
    const tokenAllowed = !proxyToken || tokensEqual(request.headers.get(PROXY_TOKEN_HEADER), proxyToken);
    const corsHeaders = createCorsHeaders(request, originAllowed);

    if (request.method === 'OPTIONS') {
      if (!originAllowed && !isSameOriginBrowserRequest) {
        return jsonError('This origin is not allowed to use the MCP proxy.', 403, corsHeaders);
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      corsHeaders.set('Allow', 'GET, POST, DELETE, OPTIONS');
      return jsonError('HTTP method not allowed by the MCP proxy.', 405, corsHeaders);
    }
    if (!originAllowed && !isSameOriginBrowserRequest && !(proxyToken && tokenAllowed)) {
      return jsonError('This request origin is not allowed to use the MCP proxy.', 403, corsHeaders);
    }
    if (!tokenAllowed) {
      return jsonError(`Missing or invalid ${PROXY_TOKEN_HEADER} header.`, 401, corsHeaders);
    }

    const targetValue = requestUrl.searchParams.get('url');
    if (!targetValue) {
      return jsonError('Missing "url" query parameter.', 400, corsHeaders);
    }

    const allowedHosts = splitCsv(env.MCP_PROXY_ALLOWED_HOSTS);
    const maxBodyBytes = readBoundedInteger(
      env.MCP_PROXY_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      1024,
      4 * 1024 * 1024,
    );
    const maxRedirects = readBoundedInteger(
      env.MCP_PROXY_MAX_REDIRECTS,
      DEFAULT_MAX_REDIRECTS,
      0,
      10,
    );

    try {
      let target = new URL(targetValue);
      let method = request.method;
      let body: ArrayBuffer | undefined;
      const contentLength = Number(request.headers.get('content-length') ?? 0);
      if (contentLength > maxBodyBytes) {
        throw new ProxyRequestError(413, `Request body exceeds the ${maxBodyBytes}-byte proxy limit.`);
      }
      if (method === 'POST') {
        body = await request.arrayBuffer();
        if (body.byteLength > maxBodyBytes) {
          throw new ProxyRequestError(413, `Request body exceeds the ${maxBodyBytes}-byte proxy limit.`);
        }
      }

      const headers = copyRequestHeaders(request);
      let upstream: Response | null = null;

      for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        validateTargetUrl(target, requestOrigin, allowedHosts);
        const validatedAddresses = await validateResolvedAddresses(target, resolveHostname);
        const upstreamInit: RequestInit = {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: request.signal,
        };
        upstream = fetchOverride
          ? await fetchOverride(target, upstreamInit)
          : await fetchWithPinnedAddress(target, upstreamInit, validatedAddresses);

        if (!REDIRECT_STATUSES.has(upstream.status)) break;
        const location = upstream.headers.get('location');
        if (!location) break;
        if (redirectCount === maxRedirects) {
          throw new ProxyRequestError(502, `Upstream exceeded the ${maxRedirects}-redirect proxy limit.`);
        }

        const nextTarget = new URL(location, target);
        if (nextTarget.origin !== target.origin) {
          headers.delete('authorization');
        }
        if (upstream.status === 303 || ((upstream.status === 301 || upstream.status === 302) && method === 'POST')) {
          method = 'GET';
          body = undefined;
          headers.delete('content-type');
        }
        await upstream.body?.cancel();
        target = nextTarget;
      }

      if (!upstream) {
        throw new ProxyRequestError(502, 'The upstream MCP request did not produce a response.');
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: createResponseHeaders(upstream.headers, corsHeaders),
      });
    } catch (error) {
      if (error instanceof ProxyRequestError) {
        return jsonError(error.message, error.status, corsHeaders);
      }
      if (error instanceof TypeError && /Invalid URL/i.test(error.message)) {
        return jsonError('Invalid target URL.', 400, corsHeaders);
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return jsonError('Proxy request was cancelled.', 499, corsHeaders);
      }

      const detail = error instanceof Error ? error.message : String(error);
      return jsonError(`Upstream MCP request failed: ${detail}`, 502, corsHeaders);
    }
  };
};

export const handler = createCorsProxyHandler();

// Vercel's Web Handler format uses the Node.js runtime by default. Node is
// intentional here: it supports arbitrary MCP ports and DNS validation,
// while still returning the upstream ReadableStream without buffering it.
export default { fetch: handler };
