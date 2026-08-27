import { randomBytes } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10_000;
const STATE_TTL_MS = 10 * 60 * 1000;

type Fetch = typeof globalThis.fetch;

export interface TagPlusOAuthConfig {
  authUrl: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

export interface TagPlusTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

export type TagPlusOAuthErrorCategory =
  | "http_error"
  | "invalid_json"
  | "invalid_token_response"
  | "network_error"
  | "timeout";

export interface TagPlusOAuthErrorEvidence {
  stage: "token_exchange" | "token_response_parsing" | "access_token_validation";
  endpoint: string;
  category: TagPlusOAuthErrorCategory;
  durationMs: number;
  httpStatus?: number;
  fields?: {
    accessTokenPresent: boolean;
    refreshTokenPresent: boolean;
    expiresInPresent: boolean;
    scopePresent: boolean;
  };
}

export class TagPlusOAuthError extends Error {
  constructor(
    message: string,
    public readonly evidence: TagPlusOAuthErrorEvidence,
  ) {
    super(message);
    this.name = "TagPlusOAuthError";
  }
}

export class TagPlusOAuthTimeoutError extends TagPlusOAuthError {
  constructor(evidence: TagPlusOAuthErrorEvidence) {
    super("TagPlus token request timed out", evidence);
    this.name = "TagPlusOAuthTimeoutError";
  }
}

export function parseReadScopes(value: string): string[] {
  const scopes = [...new Set(value.trim().split(/\s+/).filter(Boolean))];
  if (!scopes.includes("read:clientes")) {
    throw new Error("TAGPLUS_SCOPES must include read:clientes");
  }
  if (scopes.some((scope) => !scope.startsWith("read:"))) {
    throw new Error("TAGPLUS_SCOPES may contain read scopes only");
  }
  return scopes;
}

export function createAuthorizationUrl(
  config: Pick<TagPlusOAuthConfig, "authUrl" | "clientId" | "scopes">,
  state: string,
): URL {
  const url = new URL(config.authUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: parseReadScopes(config.scopes).join(" "),
    state,
  }).toString();
  return url;
}

export function createStateStore(options: { now?: () => number } = {}) {
  const states = new Map<string, number>();
  const now = options.now ?? Date.now;
  return {
    issue(): string {
      const state = randomBytes(32).toString("base64url");
      states.set(state, now() + STATE_TTL_MS);
      return state;
    },
    consume(candidate: string): boolean {
      const expiry = states.get(candidate);
      states.delete(candidate);
      if (expiry === undefined || expiry < now()) return false;
      return true;
    },
  };
}

export async function exchangeAuthorizationCode(
  config: Pick<
    TagPlusOAuthConfig,
    "baseUrl" | "clientId" | "clientSecret"
  >,
  code: string,
  options: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<TagPlusTokens> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const tokenUrl = new URL("oauth2/token", ensureTrailingSlash(config.baseUrl));
  const endpoint = `${tokenUrl.origin}${tokenUrl.pathname}`;
  const startedAt = performance.now();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    const response = await (options.fetch ?? globalThis.fetch)(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new TagPlusOAuthError(
        `TagPlus token request failed with HTTP ${response.status}`,
        {
          stage: "token_exchange",
          endpoint,
          category: "http_error",
          httpStatus: response.status,
          durationMs: Math.round(performance.now() - startedAt),
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TagPlusOAuthError("TagPlus token response was not valid JSON", {
        stage: "token_response_parsing",
        endpoint,
        category: "invalid_json",
        httpStatus: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
    return parseTokenResponse(payload, {
      endpoint,
      httpStatus: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new TagPlusOAuthTimeoutError({
        stage: "token_exchange",
        endpoint,
        category: "timeout",
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
    if (error instanceof TagPlusOAuthError) throw error;
    throw new TagPlusOAuthError("TagPlus token request failed", {
      stage: "token_exchange",
      endpoint,
      category: "network_error",
      durationMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseTokenResponse(
  value: unknown,
  context: { endpoint: string; httpStatus: number; durationMs: number },
): TagPlusTokens {
  if (typeof value !== "object" || value === null) {
    throw invalidTokenResponse(context, {
      accessTokenPresent: false,
      refreshTokenPresent: false,
      expiresInPresent: false,
      scopePresent: false,
    });
  }
  const payload = value as Record<string, unknown>;
  const fields = {
    accessTokenPresent:
      typeof payload.access_token === "string" && Boolean(payload.access_token),
    refreshTokenPresent:
      typeof payload.refresh_token === "string" && Boolean(payload.refresh_token),
    expiresInPresent: typeof payload.expires_in === "number",
    scopePresent: typeof payload.scope === "string",
  };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw invalidTokenResponse(context, fields);
  }
  const result: TagPlusTokens = { accessToken: payload.access_token };
  if (typeof payload.refresh_token === "string" && payload.refresh_token) {
    result.refreshToken = payload.refresh_token;
  }
  if (typeof payload.expires_in === "number") result.expiresIn = payload.expires_in;
  if (typeof payload.scope === "string") result.scope = payload.scope;
  return result;
}

function invalidTokenResponse(
  context: { endpoint: string; httpStatus: number; durationMs: number },
  fields: NonNullable<TagPlusOAuthErrorEvidence["fields"]>,
): TagPlusOAuthError {
  return new TagPlusOAuthError("TagPlus token response has no access token", {
    stage: "access_token_validation",
    category: "invalid_token_response",
    fields,
    ...context,
  });
}

function ensureTrailingSlash(value: string): URL {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
