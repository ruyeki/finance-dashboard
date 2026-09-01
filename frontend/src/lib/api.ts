// Same-origin by default: requests hit /api/* on whatever host served the page,
// and Next rewrites them to the backend (see next.config.mjs). Override only to
// point at a backend on a different origin.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
 * The request never reached the server — the backend is down, or API_URL was
 * overridden to an address that no longer exists. Deliberately distinct from
 * ApiError so the UI can say "cannot reach the API" rather than implying the
 * credentials were wrong.
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
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch() rejects only when the request could not be completed at all.
    throw new NetworkError(API_URL);
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
