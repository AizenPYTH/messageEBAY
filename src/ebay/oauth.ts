import {
  BROWSE_SCOPE,
  config,
  ebayUrls,
  MESSAGE_SCOPE,
  OAUTH_SCOPES,
} from "../config.js";

export type EbayTokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export function buildAuthorizeUrl(state?: string): string {
  const url = new URL(ebayUrls.authorize);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.ruName);
  url.searchParams.set("scope", OAUTH_SCOPES);
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

export function extractCode(raw: string): string {
  const trimmed = raw.trim();

  try {
    const asUrl = new URL(trimmed);
    const fromQuery = asUrl.searchParams.get("code");
    if (fromQuery) return fromQuery;
  } catch {
    // not a URL — treat as raw code
  }

  if (trimmed.startsWith("code=")) {
    return decodeURIComponent(trimmed.slice("code=".length));
  }

  return trimmed;
}

async function tokenRequest(
  body: URLSearchParams,
): Promise<EbayTokenSet> {
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(ebayUrls.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body,
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Token exchange failed: ${data.error ?? response.status} ${data.error_description ?? ""}`.trim(),
    );
  }

  return {
    access_token: data.access_token,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    expires_in: data.expires_in ?? 0,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<EbayTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.ruName,
  });
  return tokenRequest(body);
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<EbayTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: OAUTH_SCOPES,
  });
  return tokenRequest(body);
}

/**
 * Application token (client credentials) — for the public catalogue APIs that
 * describe products rather than this seller's account. No user consent needed.
 */
let appToken: { value: string; expiresAt: number } | null = null;

export async function getApplicationToken(): Promise<string> {
  const now = Date.now();
  if (appToken && appToken.expiresAt > now + 60_000) return appToken.value;

  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: BROWSE_SCOPE,
    }),
  );
  appToken = {
    value: tokens.access_token,
    expiresAt: now + Math.max(0, tokens.expires_in - 60) * 1000,
  };
  return appToken.value;
}

/** Test seam — forget the cached application token. */
export function resetApplicationToken(): void {
  appToken = null;
}

export { BROWSE_SCOPE, MESSAGE_SCOPE, OAUTH_SCOPES };
