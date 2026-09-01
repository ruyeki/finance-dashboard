/** Port the FastAPI backend listens on. */
const API_PORT = 8787;

/**
 * Base URL of the backend.
 *
 * Derived from the page's own host unless NEXT_PUBLIC_API_URL says otherwise.
 * A pinned IP goes stale the moment the machine's DHCP lease moves, and every
 * request then fails in a way that looks like a wrong password rather than a
 * wrong address. Following `window.location` means the API is always looked up
 * on whatever host you actually browsed to, so the two cannot drift apart.
 */
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  // Server-side render only; the browser re-evaluates this on load.
  return `http://localhost:${API_PORT}`;
}

/** The server answered, and said no. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The request never reached the server — wrong host, wrong port, server down,
 * or CORS refused it. Deliberately distinct from ApiError so the UI can say
 * "cannot reach the API" instead of implying the credentials were wrong.
 */
export class NetworkError extends Error {
  base: string;
  constructor(base: string) {
    super(`Could not reach the API at ${base}`);
    this.name = "NetworkError";
    this.base = base;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = apiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch() rejects only when the request could not be completed at all.
    throw new NetworkError(base);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
