import { createDefaultAiEngine } from "../ai/index.js";
import { isNoReplyNeeded } from "../analysis/needsReply.js";
import { ensureSellerAlerts } from "../alerts/index.js";
import { loadUnreadInboxItems } from "../conversations/inboxService.js";
import {
  alreadyRepliedAwaitingBuyer,
  draftAlreadySentInThread,
  isForeignSellerListing,
  ourRepliesSinceIncoming,
  weInitiatedContact,
} from "./alreadyReplied.js";
import { loadReferenceCache } from "../product/referenceCache.js";
import { autopilotMode } from "./killSwitch.js";
import { isMutedBuyer } from "./mutedBuyers.js";
import {
  isFromSelf,
  isOwnListing,
  resolveClientUsername,
  resolveSelfUsername,
} from "../conversations/messageSides.js";
import {
  listAutopilotUserIds,
  touchAutopilotRun,
} from "../database/repositories/appProfiles.js";
import {
  hasOpenAlert,
  insertSellerAlert,
} from "../database/repositories/sellerAlerts.js";
import {
  markMessagesProcessed,
  wasMessageProcessed,
} from "../database/repositories/autopilotProcessed.js";
import { withUserEbayToken } from "../ebay/connectionService.js";
import { getConversationMessages, type EbayMessage } from "../ebay/messageApi.js";
import { getAuthenticatedUsername } from "../ebay/getUser.js";
import { sendConversationMessage } from "../ebay/sendMessage.js";
import {
  collectPendingBuyerMessages,
  currentAskFingerprints,
  selectCurrentBuyerAsk,
} from "../conversations/index.js";

export type AutopilotConversationResult = {
  conversationId: string;
  buyer?: string;
  action: "sent" | "alerted" | "skipped" | "error";
  detail: string;
};

export type AutopilotUserResult = {
  userId: string;
  processed: number;
  sent: number;
  alerted: number;
  skipped: number;
  errors: number;
  conversations: AutopilotConversationResult[];
};

export type AutopilotRunResult = {
  users: AutopilotUserResult[];
  startedAt: string;
  finishedAt: string;
};

/**
 * Soft safety cap so a single run cannot burn infinite LLM calls.
 * eBay page size is always ≤50; we paginate to cover unread in the window.
 */
const DEFAULT_PROCESS_LIMIT = 200;
/** Ignore threads whose last activity is older than this (no April backlog). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** After this many of our replies without a new buyer message, stop. */
const MAX_UNANSWERED_AUTO_REPLIES = 1;
/** After this many seller messages in a thread, stop auto-reply → Rapports. */
const MAX_SELLER_AUTO_REPLIES = 3;

/** Same incoming message must not be handled twice in overlapping crons. */
const inFlightFingerprints = new Set<string>();

function flightKey(conversationId: string, fingerprint: string): string {
  return `${conversationId}::${fingerprint}`;
}

function isWithinLast7Days(dateIso?: string): boolean {
  if (!dateIso) return false;
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= MAX_AGE_MS;
}

function shouldAutoSend(input: {
  escalated?: boolean;
  reply?: string;
}): boolean {
  if (input.escalated) return false;
  return Boolean(input.reply?.trim());
}

function countSellerMessages(
  messages: EbayMessage[],
  selfUsername?: string,
): number {
  return messages.filter((m) =>
    isFromSelf({
      senderUsername: m.senderUsername,
      selfUsername,
    }),
  ).length;
}

/**
 * Process ALL unread threads that still need a useful seller answer.
 * Photos / escalations / >3 seller msgs / unsure / useless ack → no auto reply.
 */
export async function runAutopilotForUser(
  userId: string,
  options?: { limit?: number },
): Promise<AutopilotUserResult> {
  const limit = options?.limit ?? DEFAULT_PROCESS_LIMIT;
  const mode = autopilotMode();
  const result: AutopilotUserResult = {
    userId,
    processed: 0,
    sent: 0,
    alerted: 0,
    skipped: 0,
    errors: 0,
    conversations: [],
  };

  if (mode === "off") {
    result.conversations.push({
      conversationId: "-",
      action: "skipped",
      detail: "Autopilot désactivé (AUTOPILOT_ENABLED=false)",
    });
    return result;
  }

  // What the marketplace taught us about service codes, before any matching.
  await loadReferenceCache();

  // Autopilot always uses two-step reason→draft for stricter NO_REPLY.
  const prevTwoStep = process.env.OPENAI_TWO_STEP;
  process.env.OPENAI_TWO_STEP = "1";

  try {
    await withUserEbayToken(userId, async () => {
      // Paginate eBay at ≤50/page — never pass limit>50 to the API.
      const inbox = await loadUnreadInboxItems(limit);
      const engine = createDefaultAiEngine();
      const authUsername = await getAuthenticatedUsername().catch(
        () => undefined,
      );
      // Unread + question acheteur sur NOS produits — pas les fils déjà répondu.
      const candidates = inbox
        .filter((item) => {
          if (!isWithinLast7Days(item.dateIso)) return false;
          if (item.lastLooksLikeOurReply) return false;
          if (
            isForeignSellerListing({
              authUsername,
              listingSeller: item.listingSeller,
            })
          ) {
            return false;
          }
          if (item.weInitiated && !item.listingSeller) return false;
          return (
            item.awaitingReply &&
            (item.unreadCount > 0 ||
              item.isNew ||
              item.lastSenderSide === "client")
          );
        })
        .slice(0, limit);

      for (const item of candidates) {
        result.processed += 1;
        try {
          if (isMutedBuyer(item.buyer)) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer: item.buyer,
              action: "skipped",
              detail: "Acheteur en liste muette — rien envoyé",
            });
            continue;
          }

          if (isNoReplyNeeded(item.lastMessagePreview)) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer: item.buyer,
              action: "skipped",
              detail: "Message inutile (merci / ok / salutation) — rien envoyé",
            });
            continue;
          }

          if (item.lastLooksLikeOurReply) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer: item.buyer,
              action: "skipped",
              detail: "Déjà répondu — en attente de l'acheteur",
            });
            continue;
          }

          if (
            isForeignSellerListing({
              authUsername,
              listingSeller: item.listingSeller,
            }) ||
            (item.weInitiated && !item.listingSeller)
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer: item.buyer,
              action: "skipped",
              detail: "Pas notre annonce / on a contacté un autre vendeur",
            });
            continue;
          }

          let ai = await engine.run({
            conversationId: item.conversationId,
            sellerUsername: authUsername,
          });
          const listingSeller =
            ai.listing?.sellerUsername ?? item.listingSeller;
          const selfUsername = resolveSelfUsername({
            authUsername,
            listingSeller,
          });
          const selfUsernames = [selfUsername, authUsername];
          if (
            listingSeller &&
            authUsername &&
            !isOwnListing({ authUsername, listingSeller })
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              action: "skipped",
              detail: "Conversation acheteur (pas notre annonce)",
            });
            continue;
          }
          if (
            weInitiatedContact({
              messages: ai.conversation.messages,
              selfUsernames,
            }) &&
            (!listingSeller ||
              isForeignSellerListing({ authUsername, listingSeller }))
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              action: "skipped",
              detail: "On a contacté ce vendeur — pas de réponse auto",
            });
            continue;
          }
          const participants = ai.conversation.messages.flatMap((m) => [
            m.senderUsername,
            m.recipientUsername,
          ]);
          const buyer = resolveClientUsername({
            selfUsername,
            participants,
          });
          if (isMutedBuyer(buyer)) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Acheteur en liste muette — rien envoyé",
            });
            continue;
          }
          const latest = ai.conversation.latestMessage;
          const latestFromBuyer =
            latest &&
            !isFromSelf({
              senderUsername: latest.senderUsername,
              selfUsername,
            }) &&
            !alreadyRepliedAwaitingBuyer({
              messages: ai.conversation.messages,
              selfUsernames,
            });

          if (
            alreadyRepliedAwaitingBuyer({
              messages: ai.conversation.messages,
              selfUsernames,
            })
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Dernier message déjà le nôtre — rien renvoyé",
            });
            continue;
          }

          if (latestFromBuyer && isNoReplyNeeded(latest?.messageBody)) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Dernier message inutile — rien envoyé",
            });
            continue;
          }

          const unanswered = ourRepliesSinceIncoming({
            messages: ai.conversation.messages,
            selfUsernames,
          });
          if (unanswered >= MAX_UNANSWERED_AUTO_REPLIES) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Déjà une réponse auto en attente — pas de relance",
            });
            continue;
          }

          const sellerMsgCount = countSellerMessages(
            ai.conversation.messages,
            selfUsername,
          );
          if (sellerMsgCount >= MAX_SELLER_AUTO_REPLIES) {
            const alertType = "autopilot_max_replies";
            const reason = `Auto stop — déjà ${sellerMsgCount} messages vendeur (max ${MAX_SELLER_AUTO_REPLIES}). À traiter à la main.`;
            const already = await hasOpenAlert(
              item.conversationId,
              alertType,
            ).catch(() => false);
            if (!already) {
              await insertSellerAlert({
                userId,
                conversationId: item.conversationId,
                buyerUsername: buyer,
                listingTitle: ai.listing?.title,
                alertType,
                reason,
                buyerMessage: latestFromBuyer ? latest?.messageBody : null,
                messageCount: ai.conversation.messages.length,
              }).catch(() => undefined);
            }
            result.alerted += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "alerted",
              detail: reason,
            });
            continue;
          }

          await ensureSellerAlerts({
            userId,
            conversationId: item.conversationId,
            buyerUsername: buyer,
            listingTitle: ai.listing?.title,
            listingPrice: ai.listing?.price,
            messages: ai.conversation.messages,
            responsePlan: ai.responsePlan,
            latestBuyerText: latestFromBuyer ? latest?.messageBody : null,
            sellerUsername: selfUsername,
            authUsername,
            listingSellerUsername: listingSeller,
          });

          if (ai.escalated || ai.responsePlan.needsSellerIntervention) {
            result.alerted += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "alerted",
              detail:
                ai.responsePlan.escalationLabel ??
                "Intervention vendeur — aucun message envoyé",
            });
            continue;
          }

          let reply = ai.reply?.trim() ?? "";
          if (!shouldAutoSend({ escalated: ai.escalated, reply })) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail:
                "Pas assez sûr / rien d'utile à répondre — rien envoyé",
            });
            continue;
          }

          if (
            draftAlreadySentInThread({
              draft: reply,
              messages: ai.conversation.messages,
            })
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Même message déjà envoyé dans le fil — pas de spam",
            });
            continue;
          }

          const fingerprints =
            ai.metadata.currentAskFingerprints?.filter(Boolean) ?? [];
          const already = await Promise.all(
            fingerprints.map((fp) =>
              wasMessageProcessed(item.conversationId, fp),
            ),
          );
          if (
            fingerprints.some((fp) =>
              inFlightFingerprints.has(flightKey(item.conversationId, fp)),
            ) ||
            already.some(Boolean)
          ) {
            result.skipped += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "skipped",
              detail: "Message déjà traité — pas de double envoi",
            });
            continue;
          }
          for (const fp of fingerprints) {
            inFlightFingerprints.add(flightKey(item.conversationId, fp));
          }

          try {
            const fresh = await getConversationMessages(
              item.conversationId,
              "FROM_MEMBERS",
            ).catch(() => undefined);
            if (fresh?.messages?.length) {
              const pending = collectPendingBuyerMessages({
                messages: fresh.messages,
                selfUsername,
              });
              const ask = selectCurrentBuyerAsk(pending);
              const freshIds = currentAskFingerprints(
                item.conversationId,
                ask.messages,
              );
              const changed =
                freshIds.join("|") !== fingerprints.join("|") &&
                Boolean(ask.text.trim());
              if (changed) {
                const again = await engine.run({
                  conversationId: item.conversationId,
                  sellerUsername: authUsername,
                });
                const next = again.reply?.trim() ?? "";
                if (!shouldAutoSend({ escalated: again.escalated, reply: next })) {
                  result.skipped += 1;
                  result.conversations.push({
                    conversationId: item.conversationId,
                    buyer,
                    action: "skipped",
                    detail:
                      "Nouveau message acheteur — brouillon précédent abandonné",
                  });
                  continue;
                }
                if (
                  draftAlreadySentInThread({
                    draft: next,
                    messages: again.conversation.messages,
                  })
                ) {
                  result.skipped += 1;
                  result.conversations.push({
                    conversationId: item.conversationId,
                    buyer,
                    action: "skipped",
                    detail: "Même message déjà envoyé dans le fil — pas de spam",
                  });
                  continue;
                }
                ai = again;
                reply = next;
              }
            }

            if (mode === "dry_run") {
              result.skipped += 1;
              result.conversations.push({
                conversationId: item.conversationId,
                buyer,
                action: "skipped",
                detail: `Mode brouillon (AUTOPILOT_DRY_RUN) — non envoyé : ${reply.replace(/\s+/g, " ").slice(0, 160)}`,
              });
              continue;
            }

            const send = await sendConversationMessage(
              item.conversationId,
              reply,
            );
            if (!send.ok) {
              result.errors += 1;
              result.conversations.push({
                conversationId: item.conversationId,
                buyer,
                action: "error",
                detail: send.errorDetail ?? `HTTP ${send.status}`,
              });
              continue;
            }

            await markMessagesProcessed({
              conversationId: item.conversationId,
              fingerprints:
                ai.metadata.currentAskFingerprints ?? fingerprints,
              action: "sent",
            });

            result.sent += 1;
            result.conversations.push({
              conversationId: item.conversationId,
              buyer,
              action: "sent",
              detail: `Envoyé (${ai.responsePlan.intentLabel})`,
            });
          } finally {
            for (const fp of fingerprints) {
              inFlightFingerprints.delete(flightKey(item.conversationId, fp));
            }
          }
          continue;
        } catch (error: unknown) {
          result.errors += 1;
          result.conversations.push({
            conversationId: item.conversationId,
            action: "error",
            detail: error instanceof Error ? error.message : "erreur inconnue",
          });
        }
      }
    });
  } finally {
    if (prevTwoStep === undefined) {
      delete process.env.OPENAI_TWO_STEP;
    } else {
      process.env.OPENAI_TWO_STEP = prevTwoStep;
    }
  }

  const summary = `sent=${result.sent} alerted=${result.alerted} skipped=${result.skipped} errors=${result.errors}`;
  await touchAutopilotRun(userId, summary).catch(() => undefined);
  return result;
}

/**
 * Run autopilot for every user with the toggle enabled.
 */
export async function runAutopilotAll(
  options?: { limitPerUser?: number; userIds?: string[] },
): Promise<AutopilotRunResult> {
  const startedAt = new Date().toISOString();
  const userIds = options?.userIds?.length
    ? options.userIds
    : await listAutopilotUserIds();

  const users: AutopilotUserResult[] = [];
  for (const userId of userIds) {
    try {
      users.push(
        await runAutopilotForUser(userId, { limit: options?.limitPerUser }),
      );
    } catch (error: unknown) {
      users.push({
        userId,
        processed: 0,
        sent: 0,
        alerted: 0,
        skipped: 0,
        errors: 1,
        conversations: [
          {
            conversationId: "-",
            action: "error",
            detail: error instanceof Error ? error.message : "erreur user",
          },
        ],
      });
    }
  }

  return {
    users,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
