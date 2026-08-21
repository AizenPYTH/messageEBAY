import "server-only";
import {
  analyzeMessage,
  buildAssistantContext,
  createDefaultAiEngine,
  ensureSellerAlerts,
  findConversationSummary,
  formatConversationDate,
  getAuthenticatedUsername,
  isFromSelf,
  loadInboxItems,
  loadPromptSellerProfile,
  markEbayConnectionSynced,
  resolveClientUsername,
  resolveSelfUsername,
  sendConversationMessage,
  sortMessagesChronologically,
  syncConversationToDatabase,
} from "@/server/core";
import { getOptionalUser } from "@/server/auth";
import { withEbayContext } from "@/server/ebaySession";
import { ensureServerEnv } from "@/server/env";
import { toUserError } from "@/server/errors";

export type InboxListItemDto = {
  conversationId: string;
  buyer: string;
  listingTitle: string;
  lastMessagePreview: string;
  dateLabel: string;
  dateIso?: string;
  unreadCount: number;
  isNew: boolean;
  awaitingReply: boolean;
  lastSenderSide: "client" | "seller" | "unknown";
  lastSenderUsername?: string;
  referenceId?: string;
};

export type MessageDto = {
  messageId?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
  dateLabel: string;
  body: string;
  isFromSeller: boolean;
};

export type ConversationDetailDto = {
  conversationId: string;
  buyer: string;
  listing: {
    itemId?: string;
    title: string;
    price?: string;
    currency?: string;
    condition?: string;
    status?: string;
    quantity?: string;
    sellerUsername?: string;
    error?: string;
  };
  seller: {
    username?: string;
    displayName?: string;
    tone?: string;
    style?: string;
    signature?: string;
  };
  messages: MessageDto[];
  latestMessage?: MessageDto;
  promptContext: string;
};

export type AiGenerationDto = {
  reply: string;
  model: string;
  latencyMs: number;
  systemPrompt: string;
  userPrompt: string;
  promptContext: string;
  sellerProfileJson: string;
  ragSummary: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  intentLabel: string;
  listingAnswerability?: string;
  /** AI refused to answer — seller must intervene. */
  escalated: boolean;
  escalationLabel?: string;
  escalationReason?: string;
  alertCreated: boolean;
  digestCreated: boolean;
  /** Shipment tracking resolution (où est mon colis). */
  shipment?: {
    kind: string;
    trackingNumber?: string;
    carrier?: string;
    statusLabel?: string;
    detailMessage?: string;
    trackingUrl?: string;
  };
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function fetchInboxList(): Promise<ActionResult<InboxListItemDto[]>> {
  ensureServerEnv();
  try {
    const items = await withEbayContext(() => loadInboxItems(50));
    return {
      ok: true,
      data: items.map((item) => ({
        conversationId: item.conversationId,
        buyer: item.buyer,
        listingTitle: item.listingTitle,
        lastMessagePreview: item.lastMessagePreview,
        dateLabel: item.dateLabel,
        dateIso: item.dateIso,
        unreadCount: item.unreadCount,
        isNew: item.isNew,
        awaitingReply: item.awaitingReply,
        lastSenderSide: item.lastSenderSide,
        lastSenderUsername: item.lastSenderUsername,
        referenceId: item.referenceId,
      })),
    };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function fetchConversationDetail(
  conversationId: string,
): Promise<ActionResult<ConversationDetailDto>> {
  ensureServerEnv();
  try {
    return await withEbayContext(async () => {
      const ctx = await buildAssistantContext(conversationId);
      const authUsername = await getAuthenticatedUsername();
      const listingSeller = ctx.listing?.sellerUsername;
      // Bubble side = token account only (never both auth + listing seller)
      const selfUsername = resolveSelfUsername({ authUsername, listingSeller });
      const sellerUsername = selfUsername;
      const sellerProfile = sellerUsername
        ? await loadPromptSellerProfile(sellerUsername)
        : listingSeller
          ? await loadPromptSellerProfile(listingSeller)
          : null;

      const messagesSorted = sortMessagesChronologically(ctx.messages);
      const participants = messagesSorted.flatMap((m) => [
        m.senderUsername,
        m.recipientUsername,
      ]);
      if (ctx.latestMessage) {
        participants.push(
          ctx.latestMessage.senderUsername,
          ctx.latestMessage.recipientUsername,
        );
      }
      const summary = await findConversationSummary(conversationId).catch(
        () => undefined,
      );
      const buyer = resolveClientUsername({
        selfUsername,
        otherPartyUsername: summary?.otherPartyUsername,
        participants,
      });

      const toDto = (m: (typeof messagesSorted)[number]): MessageDto => ({
        messageId: m.messageId,
        senderUsername: m.senderUsername,
        recipientUsername: m.recipientUsername,
        createdDate: m.createdDate,
        dateLabel: formatConversationDate(m.createdDate),
        body: m.messageBody?.trim() || "(vide)",
        isFromSeller: isFromSelf({
          senderUsername: m.senderUsername,
          selfUsername,
        }),
      });

      const messages = messagesSorted.map(toDto);
      const latestMessage = ctx.latestMessage
        ? toDto(ctx.latestMessage)
        : messages[messages.length - 1];

      // Seller alerts only on OUR listings, and only from the buyer's message.
      const user = await getOptionalUser();
      const latestBuyerText = latestMessage?.isFromSeller
        ? undefined
        : latestMessage?.body;
      const plan = analyzeMessage(latestBuyerText);
      await ensureSellerAlerts({
        userId: user?.id ?? null,
        conversationId,
        buyerUsername: buyer,
        listingTitle: ctx.listing?.title,
        listingPrice: ctx.listing?.price,
        messages: ctx.messages,
        responsePlan: plan,
        latestBuyerText: latestBuyerText ?? null,
        sellerUsername: selfUsername,
        authUsername: authUsername,
        listingSellerUsername: listingSeller,
      });

      return {
        ok: true,
        data: {
          conversationId,
          buyer,
          listing: {
            itemId: ctx.listingItemId ?? ctx.listing?.itemId,
            title: ctx.listing?.title?.trim() || "(annonce inconnue)",
            price: ctx.listing?.price,
            currency: ctx.listing?.currency,
            condition: ctx.listing?.condition,
            status: ctx.listing?.listingStatus,
            quantity: ctx.listing?.quantity,
            sellerUsername: ctx.listing?.sellerUsername,
            error: ctx.listingError,
          },
          seller: {
            username: sellerUsername,
            displayName: sellerProfile?.displayName,
            tone: sellerProfile?.tone,
            style: sellerProfile?.style,
            signature: sellerProfile?.signature,
          },
          messages,
          latestMessage,
          promptContext: ctx.promptContext,
        },
      };
    });
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function generateAiReply(
  conversationId: string,
): Promise<ActionResult<AiGenerationDto>> {
  ensureServerEnv();
  try {
    return await withEbayContext(async () => {
      const engine = createDefaultAiEngine();
      const result = await engine.run({ conversationId });
      const user = await getOptionalUser();
      const authUsername = await getAuthenticatedUsername();
      const selfUsername = resolveSelfUsername({
        authUsername,
        listingSeller: result.listing?.sellerUsername,
      });
      const participants = result.conversation.messages.flatMap((m) => [
        m.senderUsername,
        m.recipientUsername,
      ]);
      const buyer = resolveClientUsername({
        selfUsername,
        participants,
      });

      const latestFromBuyer = result.conversation.latestMessage
        ? !isFromSelf({
            senderUsername: result.conversation.latestMessage.senderUsername,
            selfUsername,
          })
        : false;
      const alerts = await ensureSellerAlerts({
        userId: user?.id ?? null,
        conversationId,
        buyerUsername: buyer,
        listingTitle: result.listing?.title,
        listingPrice: result.listing?.price,
        messages: result.conversation.messages,
        responsePlan: result.responsePlan,
        latestBuyerText: latestFromBuyer
          ? result.conversation.latestMessage?.messageBody
          : null,
        sellerUsername: selfUsername,
        authUsername: authUsername,
        listingSellerUsername: result.listing?.sellerUsername,
      });

      const ragSummary =
        result.similarConversations.length === 0
          ? "(aucune conversation similaire)"
          : result.similarConversations
              .map((example, index) => {
                const q = example.clientQuestion.slice(0, 120);
                const a = example.sellerReply?.slice(0, 120) ?? "(pas de réponse)";
                return `#${index + 1} Q: ${q}\nA: ${a}`;
              })
              .join("\n\n");

      return {
        ok: true,
        data: {
          reply: result.reply,
          model: result.model,
          latencyMs: result.latencyMs,
          systemPrompt: result.systemPrompt,
          userPrompt: result.userPrompt,
          promptContext: result.userPrompt,
          sellerProfileJson: JSON.stringify(result.sellerProfile, null, 2),
          ragSummary,
          tokenUsage: result.tokenUsage,
          intentLabel: result.metadata.intentLabel,
          listingAnswerability: result.responsePlan.listingAnswerability,
          escalated: Boolean(result.escalated),
          escalationLabel: result.responsePlan.escalationLabel,
          escalationReason: result.responsePlan.escalationReason,
          alertCreated: Boolean(alerts.escalationAlert),
          digestCreated: Boolean(alerts.digestAlert),
          ...(result.shipment
            ? {
                shipment: {
                  kind: result.shipment.kind,
                  trackingNumber: result.shipment.trackingNumber,
                  carrier: result.shipment.carrier,
                  statusLabel: result.shipment.statusLabel,
                  detailMessage: result.shipment.detailMessage,
                  trackingUrl: result.shipment.trackingUrl,
                },
              }
            : {}),
        },
      };
    });
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function sendAiReply(
  conversationId: string,
  messageText: string,
): Promise<ActionResult<{ messageId?: string }>> {
  ensureServerEnv();
  try {
    return await withEbayContext(async () => {
      const result = await sendConversationMessage(conversationId, messageText);
      if (!result.ok) {
        return {
          ok: false,
          error: toUserError(
            new Error(
              result.errorDetail ?? `Envoi eBay échoué (HTTP ${result.status})`,
            ),
          ),
        };
      }
      return { ok: true, data: { messageId: result.data.messageId } };
    });
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function syncConversation(
  conversationId: string,
): Promise<ActionResult<{ messagesSaved: number }>> {
  ensureServerEnv();
  try {
    return await withEbayContext(async () => {
      const summary = await syncConversationToDatabase(conversationId);
      if (summary.errors.length > 0) {
        return {
          ok: false,
          error: summary.errors.join(" · "),
        };
      }

      const user = await getOptionalUser();
      if (user) {
        await markEbayConnectionSynced(user.id);
      }

      return { ok: true, data: { messagesSaved: summary.messagesSaved } };
    });
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}
