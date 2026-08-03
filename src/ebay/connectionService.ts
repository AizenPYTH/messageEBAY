import {
  deleteUserConnection,
  getUserConnection,
  touchUserConnection,
  upsertSeller,
  upsertUserConnection,
} from "../database/index.js";
import type { UserConnectionRow } from "../database/types.js";
import { decryptSecret, encryptSecret } from "../security/tokenCrypto.js";
import { MESSAGE_SCOPE, refreshAccessToken } from "./oauth.js";
import { runWithEbayTokenAsync } from "./tokenContext.js";
import { getAuthenticatedUsername } from "./getUser.js";

const PROVIDER = "ebay";
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type EbayConnectionPublic = {
  connected: boolean;
  username?: string;
  expiresAt?: string | null;
  lastTestedAt?: string | null;
  lastSyncAt?: string | null;
  scopes?: string | null;
};

export function toPublicConnection(
  row: UserConnectionRow | null,
): EbayConnectionPublic {
  if (!row) return { connected: false };
  return {
    connected: true,
    username: row.provider_username ?? undefined,
    expiresAt: row.expires_at,
    lastTestedAt: row.last_tested_at,
    lastSyncAt: row.last_sync_at,
    scopes: row.scopes,
  };
}

export async function getEbayConnection(
  userId: string,
): Promise<UserConnectionRow | null> {
  return getUserConnection(userId, PROVIDER);
}

export async function saveEbayConnection(input: {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number;
  username?: string | null;
  scopes?: string | null;
}): Promise<UserConnectionRow> {
  const expiresAt =
    typeof input.expiresIn === "number" && input.expiresIn > 0
      ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
      : null;

  const row = await upsertUserConnection({
    userId: input.userId,
    provider: PROVIDER,
    providerUsername: input.username ?? null,
    accessTokenEnc: encryptSecret(input.accessToken),
    refreshTokenEnc: input.refreshToken
      ? encryptSecret(input.refreshToken)
      : null,
    expiresAt,
    scopes: input.scopes ?? MESSAGE_SCOPE,
  });

  if (input.username) {
    await upsertSeller({ username: input.username });
  }

  return row;
}

export async function disconnectEbay(userId: string): Promise<void> {
  await deleteUserConnection(userId, PROVIDER);
}

function needsRefresh(row: UserConnectionRow): boolean {
  if (!row.expires_at) return false;
  const expiresAt = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() <= REFRESH_SKEW_MS;
}

/**
 * Returns a usable eBay access token for the user, refreshing if needed.
 */
export async function resolveEbayAccessToken(
  userId: string,
): Promise<string | null> {
  let row = await getEbayConnection(userId);
  if (!row) return null;

  if (needsRefresh(row) && row.refresh_token_enc) {
    const refreshToken = decryptSecret(row.refresh_token_enc);
    const tokens = await refreshAccessToken(refreshToken);
    row = await touchUserConnection(userId, PROVIDER, {
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : row.refresh_token_enc,
      expiresAt:
        tokens.expires_in > 0
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : row.expires_at,
    });
  }

  return decryptSecret(row.access_token_enc);
}

export async function withUserEbayToken<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const token = await resolveEbayAccessToken(userId);
  if (!token) {
    throw new Error(
      "Compte eBay non connecté. Allez dans Paramètres → Connexions.",
    );
  }
  return runWithEbayTokenAsync(token, fn);
}

export async function markEbayConnectionTested(userId: string): Promise<void> {
  await touchUserConnection(userId, PROVIDER, {
    lastTestedAt: new Date().toISOString(),
  });
}

export async function markEbayConnectionSynced(userId: string): Promise<void> {
  await touchUserConnection(userId, PROVIDER, {
    lastSyncAt: new Date().toISOString(),
  });
}

export async function fetchUsernameWithToken(
  accessToken: string,
): Promise<string | undefined> {
  return runWithEbayTokenAsync(accessToken, () => getAuthenticatedUsername());
}
