import { runAiPipeline } from "./pipeline.js";
import type { AiEngine, AiEngineDeps, AiEngineRunOptions } from "./types.js";

/**
 * Creates a reusable AI orchestration engine.
 * All infrastructure is injected — safe for CLI, web, REST, workers.
 */
export function createAiEngine(deps: AiEngineDeps): AiEngine {
  return {
    run(options: AiEngineRunOptions) {
      if (!options.conversationId?.trim()) {
        return Promise.reject(new Error("conversationId is required"));
      }
      return runAiPipeline(deps, options);
    },
  };
}
