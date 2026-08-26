import type { UIMessage } from "ai";
import type { ArtifactSource } from "../phase5/contracts.ts";
import type { Phase7AArtifact } from "./artifact.ts";
import {
  phase7aActivitySchema as activitySchema,
  phase7aArtifactSchema as artifactPayloadSchema,
  phase7aErrorSchema as errorSchema,
  phase7aReceiptSchema as receiptSchema,
  phase7aRunSchema as runSchema,
  phase7aSourceSchema as sourceSchema,
  phase7aAssistantMessageSchema as messageSchema,
  type Phase7AActivity as ContractActivity,
  type Phase7AAssistantMessage as ContractAssistantMessage,
  type Phase7AError as ContractError,
  type Phase7AReceipt as ContractReceipt,
  type Phase7ARequest as ContractRequest,
  type Phase7AResearchDepth as ContractResearchDepth,
  type Phase7ARun as ContractRun,
} from "./contracts.ts";

export type BrowserArtifact = Phase7AArtifact;
export type BrowserSource = ArtifactSource;

export type Phase7AResearchDepth = ContractResearchDepth;
export type Phase7ARequest = ContractRequest;
export type Phase7AActivity = ContractActivity;
export type Phase7AResponseBlock = { text: string; source_ids: string[] };
export type Phase7AAssistantMessage = ContractAssistantMessage;
export type Phase7ARun = ContractRun;
export type Phase7AReceipt = ContractReceipt;
export type Phase7AError = ContractError;
export type ChatTurn = { id: string; role: "user" | "assistant"; text: string; source_ids: string[] };

export const phase7aActivitySchema = activitySchema;
export const phase7aMessageSchema = messageSchema;
export const phase7aSourceSchema = sourceSchema;
export const phase7aArtifactSchema = artifactPayloadSchema;
export const phase7aRunSchema = runSchema;
export const phase7aReceiptSchema = receiptSchema;
export const phase7aErrorSchema = errorSchema;

export type Phase7ADataParts = {
  activity: Phase7AActivity;
  artifact: { run_id: string; revision: number; artifact: BrowserArtifact };
  run: Phase7ARun;
  receipt: Phase7AReceipt;
  error: Phase7AError;
  message: Phase7AAssistantMessage;
  source: BrowserSource;
};
export type Phase7AUIMessage = UIMessage<unknown, Phase7ADataParts>;
