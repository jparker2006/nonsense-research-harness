import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const LUNA_MODEL = Object.freeze({
  id: "openai/gpt-5.6-luna",
  reasoningEffort: "max" as const,
  zdr: false,
  maxPricePerMillion: Object.freeze({ prompt: 0.2, completion: 1.2 }),
});

export function createResearchModel(apiKey: string) {
  return createOpenRouter({
    apiKey,
    compatibility: "strict",
    appName: "Nonsense Research Harness",
    extraBody: {
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: LUNA_MODEL.zdr,
        max_price: LUNA_MODEL.maxPricePerMillion,
      },
      usage: { include: true },
    },
  });
}
