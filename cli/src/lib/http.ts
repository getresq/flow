import { resolveBaseUrl } from "./config.js";
import { CliError, normalizeNetworkError } from "./errors.js";

export interface RequestJsonOptions {
  baseUrl?: string;
  path: string;
  query?: Record<
    string,
    string | number | boolean | Array<string | number | boolean> | undefined
  >;
  timeoutMs?: number;
  fetchImpl?: typeof fetch | undefined;
}

interface BuildRelayUrlOptions {
  baseUrl: string | undefined;
  path: string;
  query:
    | Record<
        string,
        string | number | boolean | Array<string | number | boolean> | undefined
      >
    | undefined;
}

export function buildRelayUrl({
  baseUrl,
  path,
  query,
}: BuildRelayUrlOptions): string {
  const root = resolveBaseUrl(baseUrl);
  const url = new URL(path, `${root}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function requestJson<T>({
  baseUrl,
  path,
  query,
  timeoutMs = 5_000,
  fetchImpl = fetch,
}: RequestJsonOptions): Promise<T> {
  const url = buildRelayUrl({ baseUrl, path, query });
  const controller = new AbortController();
  const timeoutError = new DOMException("The operation was aborted.", "AbortError");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });

    const response = await Promise.race([
      fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json",
        },
      }),
      timeoutPromise,
    ]);

    if (!response.ok) {
      throw new CliError(
        `request failed: ${url} (${response.status} ${response.statusText})`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new CliError(`invalid JSON response: ${url}`);
    }
  } catch (error) {
    throw normalizeNetworkError(error, url);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
