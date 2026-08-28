import type { UIMessage } from "ai";
import type { ArtifactSource } from "./content.ts";
import type { ResearchArtifact } from "./artifact.ts";
import {
  researchActivitySchema as activitySchema,
  researchArtifactEventSchema as artifactPayloadSchema,
  researchErrorSchema as errorSchema,
  researchReceiptSchema as receiptSchema,
  researchRunSchema as runSchema,
  researchSourceSchema as sourceSchema,
  researchThreadStatusSchema as threadStatusSchema,
  researchAssistantMessageSchema as messageSchema,
  type ResearchActivity as ContractActivity,
  type ResearchAssistantMessage as ContractAssistantMessage,
  type ResearchError as ContractError,
  type ResearchReceipt as ContractReceipt,
  type ResearchRequest as ContractRequest,
  type ResearchDepth as ContractResearchDepth,
  type ResearchRun as ContractRun,
  type ResearchThreadStatus as ContractThreadStatus,
} from "./contracts.ts";

export type BrowserArtifact = ResearchArtifact;
export type BrowserSource = ArtifactSource;

export type ResearchDepth = ContractResearchDepth;
export type ResearchRequest = ContractRequest;
export type ResearchActivity = ContractActivity;
export type ResearchResponseBlock = { text: string; source_ids: string[] };
export type ResearchAssistantMessage = ContractAssistantMessage;
export type ResearchRun = ContractRun;
export type ResearchReceipt = ContractReceipt;
export type ResearchError = ContractError;
export type ResearchThreadStatus = ContractThreadStatus;
export type ChatTurn = { id: string; role: "user" | "assistant"; text: string; source_ids: string[] };

export const researchActivitySchema = activitySchema;
export const researchMessageSchema = messageSchema;
export const researchSourceSchema = sourceSchema;
export const researchArtifactSchema = artifactPayloadSchema;
export const researchRunSchema = runSchema;
export const researchReceiptSchema = receiptSchema;
export const researchErrorSchema = errorSchema;
export const researchThreadStatusSchema = threadStatusSchema;

export type ResearchDataParts = {
  activity: ResearchActivity;
  artifact: { run_id: string; revision: number; artifact: BrowserArtifact };
  run: ResearchRun;
  receipt: ResearchReceipt;
  error: ResearchError;
  message: ResearchAssistantMessage;
  source: BrowserSource;
  thread: ResearchThreadStatus;
};
export type ResearchUIMessage = UIMessage<unknown, ResearchDataParts>;
