export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_INTERNAL_URL = "http://localhost:3001";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "expect",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

type RouteParams = {
  path?: string[];
};

type RouteContext = {
  params: Promise<RouteParams>;
};

function getApiBaseUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

function buildTargetUrl(request: Request, path: string[] = []): URL {
  const targetPath = path[0] === "auth" ? ["api", ...path] : path;
  const pathname = targetPath.map((segment) => encodeURIComponent(segment)).join("/");
  const targetUrl = new URL(pathname, getApiBaseUrl());
  targetUrl.search = new URL(request.url).search;
  return targetUrl;
}

function buildForwardHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  return headers;
}

async function proxyToApi(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  const init: RequestInit = {
    method: request.method,
    headers: buildForwardHeaders(request),
    redirect: "manual",
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  const apiResponse = await fetch(buildTargetUrl(request, params.path), init);
  return new Response(apiResponse.body, {
    headers: new Headers(apiResponse.headers),
    status: apiResponse.status,
    statusText: apiResponse.statusText,
  });
}

export function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}

export function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}

export function PUT(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}

export function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}

export function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return proxyToApi(request, context);
}
