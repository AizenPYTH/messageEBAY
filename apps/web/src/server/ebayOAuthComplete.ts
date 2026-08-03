import "server-only";
import {
  exchangeCodeForTokens,
  extractCode,
  fetchUsernameWithToken,
  saveEbayConnection,
} from "@/server/core";
import { ensureAppProfileForUser, type AppUser } from "@/server/auth";

export async function completeEbayOAuthWithCode(
  user: AppUser,
  rawCodeOrUrl: string,
): Promise<{ username?: string }> {
  const code = extractCode(rawCodeOrUrl);
  if (!code) {
    throw new Error("Aucun code d’autorisation trouvé dans le texte collé.");
  }

  await ensureAppProfileForUser(user);
  const tokens = await exchangeCodeForTokens(code);
  const username = await fetchUsernameWithToken(tokens.access_token);

  await saveEbayConnection({
    userId: user.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresIn: tokens.expires_in,
    username: username ?? null,
  });

  return { username };
}
