import "server-only";
import { createDefaultAiEngine } from "@/server/core";
import { ensureServerEnv } from "@/server/env";

/**
 * Thin adapter — web UI must call the AI Engine through this module,
 * never reimplement generation logic in React.
 */
export async function runAiEngine(conversationId: string) {
  ensureServerEnv();
  const engine = createDefaultAiEngine();
  return engine.run({ conversationId });
}
