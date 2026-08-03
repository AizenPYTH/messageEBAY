import "dotenv/config";
import { getRequestEbayAccessToken } from "./ebay/tokenContext.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export type EbayEnv = "sandbox" | "production";

/**
 * Lazy config — values are read on access so importing this module
 * does not throw when eBay vars are absent (needed by the web app).
 *
 * `accessToken` prefers a request-scoped token (web multi-user) then `.env` (CLI).
 */
export const config = {
  get clientId(): string {
    return required("EBAY_CLIENT_ID");
  },
  get clientSecret(): string {
    return required("EBAY_CLIENT_SECRET");
  },
  get devId(): string {
    return optional("EBAY_DEV_ID");
  },
  get ruName(): string {
    return required("EBAY_RUNAME");
  },
  get env(): EbayEnv {
    const value = optional("EBAY_ENV", "sandbox");
    return value === "production" ? "production" : "sandbox";
  },
  get accessToken(): string {
    return getRequestEbayAccessToken() || optional("EBAY_USER_ACCESS_TOKEN");
  },
  get refreshToken(): string {
    return optional("EBAY_USER_REFRESH_TOKEN");
  },
};

function isProduction(): boolean {
  return optional("EBAY_ENV", "sandbox") === "production";
}

export const ebayUrls = {
  get authorize(): string {
    return isProduction()
      ? "https://auth.ebay.com/oauth2/authorize"
      : "https://auth.sandbox.ebay.com/oauth2/authorize";
  },
  get token(): string {
    return isProduction()
      ? "https://api.ebay.com/identity/v1/oauth2/token"
      : "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
  },
  get messageApi(): string {
    return isProduction()
      ? "https://api.ebay.com/commerce/message/v1"
      : "https://api.sandbox.ebay.com/commerce/message/v1";
  },
};

/** Scope required for Commerce Message API */
export const MESSAGE_SCOPE =
  "https://api.ebay.com/oauth/api_scope/commerce.message";
