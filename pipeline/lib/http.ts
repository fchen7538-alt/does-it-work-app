// Small fetch helper shared by all pipeline sources: retries transient
// failures with backoff and enforces a per-source minimum gap between
// requests so we stay under each API's published rate limits.

export interface FetchJsonOptions {
  /** Minimum ms to wait after the *previous* call to this limiter before firing. */
  minIntervalMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export function createRateLimiter(minIntervalMs: number) {
  let lastCall = 0;
  return async function wait() {
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    lastCall = Date.now();
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { retries = 3, headers = {} } = options;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status} from ${url}`);
        }
        // Non-retryable client error (400/404/etc) — surface immediately.
        const body = await res.text().catch(() => "");
        throw new HttpClientError(res.status, url, body);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpClientError) throw err;
      lastError = err;
      attempt += 1;
      if (attempt > retries) break;
      await sleep(500 * 2 ** attempt); // 1s, 2s, 4s...
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class HttpClientError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.status = status;
    this.url = url;
  }
}
