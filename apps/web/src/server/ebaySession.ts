import "server-only";
import {
  getEbayConnection,
  resolveEbayAccessToken,
  runWithEbayTokenAsync,
  toPublicConnection,
  withUserEbayToken,
} from "@/server/core";
import type { EbayConnectionPublic } from "../../../../src/ebay/connectionService";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { ensureServerEnv, hasEnv } from "@/server/env";

export type { EbayConnectionPublic };

/**
 * Run engine work with the current user's eBay token when auth is on.
 * Falls back to `.env` EBAY_USER_ACCESS_TOKEN in soft/dev mode.
 */
export async function withEbayContext<T>(fn: () => Promise<T>): Promise<T> {
  ensureServerEnv();
  const user = await getOptionalUser();

  if (user) {
    return withUserEbayToken(user.id, fn);
  }

  if (isAuthEnforced()) {
    throw new Error("Connexion requise");
  }

  if (!hasEnv("EBAY_USER_ACCESS_TOKEN")) {
    throw new Error(
      "Aucun token eBay. Connectez eBay dans Paramètres, ou définissez EBAY_USER_ACCESS_TOKEN.",
    );
  }

  return fn();
}

export async function getCurrentEbayConnection(): Promise<EbayConnectionPublic> {
  ensureServerEnv();
  const user = await getOptionalUser();
  if (!user) {
    if (hasEnv("EBAY_USER_ACCESS_TOKEN")) {
      return {
        connected: true,
        username: "(token .env local)",
        expiresAt: null,
        lastTestedAt: null,
        lastSyncAt: null,
      };
    }
    return { connected: false };
  }

  const row = await getEbayConnection(user.id);
  return toPublicConnection(row);
}

export async function hasUsableEbayToken(): Promise<boolean> {
  ensureServerEnv();
  const user = await getOptionalUser();
  if (user) {
    const token = await resolveEbayAccessToken(user.id);
    return Boolean(token);
  }
  return hasEnv("EBAY_USER_ACCESS_TOKEN");
}

export async function withExplicitToken<T>(
  accessToken: string,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithEbayTokenAsync(accessToken, fn);
}
