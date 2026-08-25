import type { Phase5ModelReceipt } from "../phase5/model.ts";
import { createPhase6FixtureDependencies } from "../phase6/fixture.ts";
import { phase7aActionSchema, type Phase7AAction } from "./contracts.ts";
import type { Phase7AAgentDependencies } from "./agent.ts";

function receipt(): Phase5ModelReceipt {
  return {
    model: "openai/gpt-5.6-luna",
    provider: "phase7a-test-fixture",
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    latency_ms: 0,
    finish_reason: "stop",
    response_characters: 0,
    output_status: "parsed",
  };
}

export function createPhase7AFixtureDependencies(
  actions: Phase7AAction[],
  options: { signal?: AbortSignal; onEvent?: Phase7AAgentDependencies["onEvent"] } = {},
): Phase7AAgentDependencies {
  const fixture = createPhase6FixtureDependencies(options.signal);
  let index = 0;
  return {
    controller: {
      async decide() {
        const action = actions[index++];
        if (!action) throw new Error("phase7a_fixture_exhausted");
        return { value: phase7aActionSchema.parse(action), receipt: receipt(), output_status: "parsed" };
      },
    },
    composer: fixture.model,
    tools: fixture.tools,
    signal: options.signal,
    onEvent: options.onEvent,
  };
}
