import {
  getSellerByUsername,
  upsertSeller,
} from "../database/repositories/sellers.js";
import {
  getSellerProfileBySellerId,
  upsertSellerProfile,
} from "../database/repositories/sellerProfiles.js";
import type { SellerProfileRow, SellerRow } from "../database/types.js";
import type { SellerProfile } from "../prompt/types.js";
import { buildDefaultSellerProfileInput } from "./defaults.js";
import { mapSellerProfileRowToPrompt } from "./mapToPromptProfile.js";

export type SellerProfileBundle = {
  seller: SellerRow;
  profile: SellerProfileRow;
  promptProfile: SellerProfile;
};

/**
 * Loads seller profile for Prompt Engine consumption.
 * Business/DB logic stays outside the Prompt Engine.
 */
export async function loadPromptSellerProfile(
  username: string,
): Promise<SellerProfile | null> {
  const seller = await getSellerByUsername(username);
  if (!seller) return null;

  const row = await getSellerProfileBySellerId(seller.id);
  if (!row) return null;

  return mapSellerProfileRowToPrompt(row);
}

export async function getSellerProfileBundle(
  username: string,
): Promise<SellerProfileBundle | null> {
  const seller = await getSellerByUsername(username);
  if (!seller) return null;

  const profile = await getSellerProfileBySellerId(seller.id);
  if (!profile) return null;

  return {
    seller,
    profile,
    promptProfile: mapSellerProfileRowToPrompt(profile),
  };
}

export async function initDefaultSellerProfile(
  username: string,
  displayName?: string,
): Promise<SellerProfileBundle> {
  const seller = await upsertSeller({ username });
  const profile = await upsertSellerProfile(
    buildDefaultSellerProfileInput(
      seller.id,
      displayName?.trim() || username,
    ),
  );

  return {
    seller,
    profile,
    promptProfile: mapSellerProfileRowToPrompt(profile),
  };
}
