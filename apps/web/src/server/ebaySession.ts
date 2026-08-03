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
 * Prefer per-browser eBay connection; fall back to server .env token.
 */
export async function withEbayContext<T>(fn: () => Promise<T>): Promise<T> {
  ensureServerEnv();

  const user = await getOptionalUser();
  if (user) {
    const token = await resolveEbayAccessToken(user.id).catch(() => null);
    if (token) {
      return withUserEbayToken(user.id, fn);
    }
  }

  if (isAuthEnforced()) {
    throw new Error(
      "Compte eBay non connecté. Allez dans Paramètres → Connexions.",
    );
  }

  if (!hasEnv("EBAY_USER_ACCESS_TOKEN")) {
    throw new Error(
      "Aucun token eBay. Connectez eBay dans Paramètres → Connexions.",
    );
  }

  return fn();
}

export async function getCurrentEbayConnection(): Promise<EbayConnectionPublic> {
  ensureServerEnv();

  const user = await getOptionalUser();
  if (user) {
    const row = await getEbayConnection(user.id).catch(() => null);
    if (row) return toPublicConnection(row);
  }

  if (hasEnv("EBAY_USER_ACCESS_TOKEN")) {
    return {
      connected: true,
      username: "(token serveur .env — connectez eBay pour un compte par PC)",
      expiresAt: null,
      lastTestedAt: null,
      lastSyncAt: null,
    };
  }

  return { connected: false };
}

export async function hasUsableEbayToken(): Promise<boolean> {
  ensureServerEnv();
  const user = await getOptionalUser();
  if (user) {
    const token = await resolveEbayAccessToken(user.id).catch(() => null);
    if (token) return true;
  }
  return hasEnv("EBAY_USER_ACCESS_TOKEN");
}

export async function withExplicitToken<T>(
  accessToken: string,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithEbayTokenAsync(accessToken, fn);
}
