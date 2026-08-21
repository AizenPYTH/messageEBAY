import "server-only";
import {
  listOpenSellerAlerts,
  resolveSellerAlert,
  type SellerAlertRow,
} from "@/server/core";
import { ensureServerEnv } from "@/server/env";
import { toUserError } from "@/server/errors";
import type { ActionResult } from "@/server/conversations";

export type SellerAlertDto = {
  id: string;
  conversationId: string;
  buyerUsername: string;
  listingTitle: string;
  alertType: string;
  alertTypeLabel: string;
  reason: string;
  buyerMessage?: string;
  messageCount?: number;
  status: string;
  createdAt: string;
  createdLabel: string;
  /** True when the bot did not / must not reply. */
  needsAction: boolean;
};

function alertTypeLabel(type: string): string {
  const map: Record<string, string> = {
    photo_request: "Photos",
    video_request: "Vidéo",
    call_request: "Appel",
    off_platform_payment: "Paiement hors eBay",
    personal_data: "Données perso",
    legal_threat: "Plainte",
    complex_dispute: "Litige",
    return_label_request: "Bordereau retour",
    partial_refund_offer: "Remise partielle",
    partial_refund_refused: "Retour après refus",
    damaged_item_manual: "Article cassé",
    inbound_sell_offer: "Veut nous vendre",
    buyer_return_shipped: "Retour envoyé",
    digest: "Ancien digest",
    escalation: "Intervention",
  };
  return map[type] ?? type;
}

function needsAction(type: string): boolean {
  return type !== "partial_refund_offer";
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function toDto(row: SellerAlertRow): SellerAlertDto {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    buyerUsername: row.buyer_username?.trim() || "Acheteur",
    listingTitle: row.listing_title?.trim() || "(annonce)",
    alertType: row.alert_type,
    alertTypeLabel: alertTypeLabel(row.alert_type),
    reason: row.reason,
    buyerMessage: row.buyer_message ?? undefined,
    messageCount: row.message_count ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    createdLabel: formatDate(row.created_at),
    needsAction: needsAction(row.alert_type),
  };
}

export async function fetchOpenReports(): Promise<
  ActionResult<SellerAlertDto[]>
> {
  ensureServerEnv();
  try {
    const rows = await listOpenSellerAlerts(80);
    return { ok: true, data: rows.map(toDto) };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function resolveReport(
  alertId: string,
): Promise<ActionResult<{ id: string }>> {
  ensureServerEnv();
  try {
    await resolveSellerAlert(alertId);
    return { ok: true, data: { id: alertId } };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}
