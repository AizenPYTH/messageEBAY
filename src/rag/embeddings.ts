import OpenAI from "openai";
import {
  EMBEDDING_MODEL,
  hashMessageBody,
  listMessagesNeedingEmbeddings,
  saveMessageEmbedding,
} from "../database/repositories/messageEmbeddings.js";
import type { RagIndexSummary } from "./types.js";

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing env var: OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

/** Create one embedding vector for arbitrary text. */
export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAiClient();
  const input = text.trim();
  if (!input) {
    throw new Error("Cannot embed empty text.");
  }

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  const vector = response.data[0]?.embedding;
  if (!vector?.length) {
    throw new Error("OpenAI returned an empty embedding.");
  }

  return vector;
}

/**
 * Incrementally embed messages missing vectors (or with changed body hash).
 * Safe to call often — already-embedded unchanged messages are skipped.
 */
export async function indexPendingMessageEmbeddings(
  batchSize = 100,
): Promise<RagIndexSummary> {
  const summary: RagIndexSummary = {
    scannedNeedingUpdate: 0,
    embedded: 0,
    skipped: 0,
    errors: [],
  };

  const pending = await listMessagesNeedingEmbeddings(batchSize);
  summary.scannedNeedingUpdate = pending.length;

  if (pending.length === 0) {
    return summary;
  }

  const client = getOpenAiClient();

  // OpenAI supports batch inputs; keep chunks modest for large catalogs.
  const chunkSize = 50;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const inputs = chunk.map((m) => m.body?.trim() ?? "");

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
      });

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j]!;
        const embedding = response.data[j]?.embedding;
        const body = row.body?.trim() ?? "";
        if (!embedding || !body) {
          summary.skipped += 1;
          continue;
        }

        try {
          await saveMessageEmbedding({
            id: row.id,
            embedding,
            model: EMBEDDING_MODEL,
            bodyHash: hashMessageBody(body),
          });
          summary.embedded += 1;
        } catch (error) {
          summary.errors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      summary.errors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return summary;
}
