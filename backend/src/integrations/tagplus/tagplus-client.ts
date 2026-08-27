const DEFAULT_TIMEOUT_MS = 10_000;

type Fetch = typeof globalThis.fetch;

export interface TagPlusClientOptions {
  baseUrl: string;
  apiVersion: string;
  accessToken: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

export interface TagPlusResponse<T> {
  status: number;
  data: T;
}

export class TagPlusHttpError extends Error {
  constructor(public readonly status: number) {
    super(`TagPlus request failed with HTTP ${status}`);
    this.name = "TagPlusHttpError";
  }
}

export class TagPlusTimeoutError extends Error {
  constructor() {
    super("TagPlus request timed out");
    this.name = "TagPlusTimeoutError";
  }
}

export class TagPlusInvalidResponseError extends Error {
  constructor() {
    super("TagPlus returned an invalid JSON response");
    this.name = "TagPlusInvalidResponseError";
  }
}

export class TagPlusNetworkError extends Error {
  constructor() {
    super("TagPlus request failed due to a network error");
    this.name = "TagPlusNetworkError";
  }
}

export interface TagPlusClient {
  get<T = unknown>(path: string): Promise<TagPlusResponse<T>>;
}

export function createTagPlusClient(
  options: TagPlusClientOptions,
): TagPlusClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = new URL(options.baseUrl);

  return {
    async get<T = unknown>(path: string): Promise<TagPlusResponse<T>> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const url = new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl));

      try {
        const response = await fetchImplementation(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${options.accessToken}`,
            "X-Api-Version": options.apiVersion,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new TagPlusHttpError(response.status);
        }

        try {
          const data = (await response.json()) as T;
          return { status: response.status, data };
        } catch {
          throw new TagPlusInvalidResponseError();
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          throw new TagPlusTimeoutError();
        }

        if (
          error instanceof TagPlusHttpError ||
          error instanceof TagPlusInvalidResponseError
        ) {
          throw error;
        }

        throw new TagPlusNetworkError();
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function ensureTrailingSlash(url: URL): URL {
  const normalized = new URL(url);
  if (!normalized.pathname.endsWith("/")) {
    normalized.pathname += "/";
  }
  return normalized;
}
