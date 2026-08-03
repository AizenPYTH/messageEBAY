import { AsyncLocalStorage } from "node:async_hooks";

type EbayTokenStore = {
  accessToken: string;
};

const storage = new AsyncLocalStorage<EbayTokenStore>();

/**
 * Run a function with a request-scoped eBay user access token.
 * Used by the web app so the engine/CLI can share config.accessToken.
 */
export function runWithEbayToken<T>(
  accessToken: string,
  fn: () => T,
): T {
  return storage.run({ accessToken }, fn);
}

export async function runWithEbayTokenAsync<T>(
  accessToken: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ accessToken }, fn);
}

export function getRequestEbayAccessToken(): string | undefined {
  return storage.getStore()?.accessToken;
}
