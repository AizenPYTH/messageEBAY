import "server-only";
import {
  getAuthenticatedUsername,
  getSellerByUsername,
  getSellerProfileBundle,
  getSellerProfileBySellerId,
  initDefaultSellerProfile,
  upsertSellerProfile,
} from "@/server/core";
import {
  getCurrentEbayConnection,
  withEbayContext,
} from "@/server/ebaySession";
import { ensureServerEnv } from "@/server/env";
import { toUserError } from "@/server/errors";
import type { ActionResult } from "@/server/conversations";

export type SellerProfileFormDto = {
  username: string;
  sellerId: string;
  displayName: string;
  languages: string;
  responseStyle: string;
  shippingPolicy: string;
  returnPolicy: string;
  refundPolicy: string;
  negotiationPolicy: string;
  tone: string;
  signature: string;
  customInstructions: string;
};

async function resolveSellerUsername(): Promise<string | null> {
  const connection = await getCurrentEbayConnection();
  if (connection.username && !connection.username.startsWith("(")) {
    return connection.username;
  }

  try {
    return (await withEbayContext(() => getAuthenticatedUsername())) ?? null;
  } catch {
    return null;
  }
}

export async function loadSellerProfileForm(): Promise<
  ActionResult<SellerProfileFormDto | null>
> {
  ensureServerEnv();
  try {
    const username = await resolveSellerUsername();
    if (!username) {
      return { ok: true, data: null };
    }

    let bundle = await getSellerProfileBundle(username);
    if (!bundle) {
      bundle = await initDefaultSellerProfile(username);
    }

    const p = bundle.profile;
    return {
      ok: true,
      data: {
        username,
        sellerId: p.seller_id,
        displayName: p.display_name ?? "",
        languages: (p.languages ?? []).join(", "),
        responseStyle: p.response_style ?? "",
        shippingPolicy: p.shipping_policy ?? "",
        returnPolicy: p.return_policy ?? "",
        refundPolicy: p.refund_policy ?? "",
        negotiationPolicy: p.negotiation_policy ?? "",
        tone: p.tone ?? "vouvoiement",
        signature: p.signature ?? "",
        customInstructions: p.custom_instructions ?? "",
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function saveSellerProfileForm(
  input: Omit<SellerProfileFormDto, "username" | "sellerId"> & {
    username: string;
  },
): Promise<ActionResult<{ saved: true }>> {
  ensureServerEnv();
  try {
    const seller =
      (await getSellerByUsername(input.username)) ??
      (await initDefaultSellerProfile(input.username)).seller;

    const languages = input.languages
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    await upsertSellerProfile({
      sellerId: seller.id,
      displayName: input.displayName.trim() || input.username,
      languages,
      responseStyle: input.responseStyle.trim() || null,
      shippingPolicy: input.shippingPolicy.trim() || null,
      returnPolicy: input.returnPolicy.trim() || null,
      refundPolicy: input.refundPolicy.trim() || null,
      negotiationPolicy: input.negotiationPolicy.trim() || null,
      tone: input.tone.trim() || null,
      signature: input.signature.trim() || null,
      customInstructions: input.customInstructions.trim() || null,
    });

    // Touch-read to confirm
    await getSellerProfileBySellerId(seller.id);

    return { ok: true, data: { saved: true } };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}
