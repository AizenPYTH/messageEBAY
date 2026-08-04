import "server-only";
import {
  indexPendingMessageEmbeddings,
  listConversations,
  markEbayConnectionSynced,
  syncConversationToDatabase,
} from "@/server/core";
import { getOptionalUser } from "@/server/auth";
import { withEbayContext } from "@/server/ebaySession";
import { ensureServerEnv } from "@/server/env";
import { toUserError } from "@/server/errors";
import type { ActionResult } from "@/server/conversations";

export type TrainResultDto = {
  conversationsFound: number;
  conversationsSynced: number;
  messagesSaved: number;
  embeddingsCreated: number;
  errors: string[];
};

/**
 * Pull recent eBay conversations into DB, then embed them for RAG training.
 */
export async function trainFromEbayHistory(
  limit = 40,
): Promise<ActionResult<TrainResultDto>> {
  ensureServerEnv();

  try {
    return await withEbayContext(async () => {
      const conversations = await listConversations("FROM_MEMBERS", limit);
      const ids = conversations
        .map((c) => c.conversationId?.trim())
        .filter((id): id is string => Boolean(id));

      let conversationsSynced = 0;
      let messagesSaved = 0;
      const errors: string[] = [];

      for (const id of ids) {
        try {
          const summary = await syncConversationToDatabase(id);
          if (summary.errors.length > 0) {
            errors.push(...summary.errors.map((e) => `${id}: ${e}`));
          } else {
            conversationsSynced += 1;
            messagesSaved += summary.messagesSaved;
          }
        } catch (error: unknown) {
          errors.push(
            `${id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      let embeddingsCreated = 0;
      // Run a few embedding batches so large histories catch up.
      for (let i = 0; i < 5; i++) {
        const index = await indexPendingMessageEmbeddings(100);
        embeddingsCreated += index.embedded;
        if (index.errors.length) {
          errors.push(...index.errors.slice(0, 5));
        }
        if (index.embedded === 0) break;
      }

      const user = await getOptionalUser();
      if (user) {
        await markEbayConnectionSynced(user.id).catch(() => undefined);
      }

      return {
        ok: true,
        data: {
          conversationsFound: ids.length,
          conversationsSynced,
          messagesSaved,
          embeddingsCreated,
          errors: errors.slice(0, 12),
        },
      };
    });
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}
