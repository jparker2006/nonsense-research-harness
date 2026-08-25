import { randomUUID } from "node:crypto";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { runPhase7AAgentTurn, type Phase7AAgentDependencies } from "./agent.ts";
import {
  PHASE_7A_LIMITS,
  phase7aTurnResultSchema,
  phase7aWorkspaceSchema,
  type Phase7ATurnResult,
  type Phase7AWorkspace,
} from "./contracts.ts";

const phase7aWorkflowInputSchema = z.object({
  workspace: phase7aWorkspaceSchema,
  message: z.string().trim().min(1).max(PHASE_7A_LIMITS.maxMessageCharacters),
});

export function createPhase7AWorkflow(deps: Phase7AAgentDependencies) {
  const agentStep = createStep({
    id: "phase7a-adaptive-agent-turn",
    inputSchema: phase7aWorkflowInputSchema,
    outputSchema: phase7aTurnResultSchema,
    execute: async ({ inputData, runId }) => runPhase7AAgentTurn({
      workspace: inputData.workspace,
      message: inputData.message,
      runId,
    }, deps),
  });
  return createWorkflow({
    id: "nonsense-phase7a-chat-agent",
    inputSchema: phase7aWorkflowInputSchema,
    outputSchema: phase7aTurnResultSchema,
    steps: [agentStep],
    options: { validateInputs: true },
  }).then(agentStep).commit();
}

export async function runPhase7AWorkflow(options: {
  workspace: Phase7AWorkspace;
  message: string;
  runId?: string;
}, deps: Phase7AAgentDependencies): Promise<Phase7ATurnResult> {
  const workflow = createPhase7AWorkflow(deps);
  const run = await workflow.createRun({ runId: options.runId ?? `run_${randomUUID()}` });
  const result = await run.start({ inputData: { workspace: options.workspace, message: options.message } });
  if (result.status !== "success" || !result.result) throw new Error("phase7a_workflow_failed");
  return phase7aTurnResultSchema.parse(result.result);
}
