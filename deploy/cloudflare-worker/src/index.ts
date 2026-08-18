interface Env {
  ORIGIN_URL: string;
  PUBLIC_HOST: string;
}

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

function configuredOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("ORIGIN_URL must be an HTTPS origin without credentials, path, query, or fragment");
  }

  return origin;
}

export function buildTarget(incoming: URL, origin: URL): URL {
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    if (!env.PUBLIC_HOST || incoming.host !== env.PUBLIC_HOST) {
      return new Response("Not found", { status: 404 });
    }

    let origin: URL;
    try {
      origin = configuredOrigin(env.ORIGIN_URL);
    } catch {
      return new Response("Proxy configuration error", { status: 500 });
    }

    if (origin.origin === incoming.origin) {
      return new Response("Proxy configuration error", { status: 500 });
    }

    const target = buildTarget(incoming, origin);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("forwarded");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-port");
    headers.delete("x-forwarded-proto");
    headers.delete("x-real-ip");

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (!BODYLESS_METHODS.has(request.method)) {
      init.body = request.body;
    }

    return fetch(new Request(target, init));
  },
};
