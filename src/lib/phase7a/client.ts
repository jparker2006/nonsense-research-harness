import type { UIMessage } from "ai";
import { z } from "zod";
import { artifactToMarkdown, type BrowserArtifact, type BrowserSource } from "../phase6/client.ts";

export { artifactToMarkdown };
export type { BrowserArtifact, BrowserSource };

export type Phase7ARequest = { action: "message"; session_id: string; message: string };
export type Phase7AActivity = {
  id: string;
  run_id: string;
  kind: "run" | "agent" | "tool" | "composition" | "validation" | "artifact";
  label: string;
  detail: string;
  status: "running" | "complete" | "partial" | "unavailable" | "stopped" | "failed";
  tool?: "web_search" | "read_url" | "search_transcripts" | "open_transcript_chunk";
  created_at: string;
};
export type Phase7AAssistantMessage = { message_id: string; run_id: string; text: string; source_ids: string[]; created_at: string };
export type Phase7ARun = { session_id: string; run_id: string; state: "running" | "complete" | "partial" | "stopped" | "failed"; summary: string };
export type Phase7AReceipt = {
  run_id: string;
  status: "complete" | "partial" | "stopped" | "failed";
  counts: {
    controller_turns: number;
    provider_requests: number;
    grok_turns: number;
    web_searches: number;
    url_reads: number;
    transcript_searches: number;
    transcript_opens: number;
    compositions: number;
    repairs: number;
  };
  accounted_cost_usd: number;
  elapsed_ms: number;
  limitations: string[];
  artifact_revision: number;
};
export type Phase7AError = { run_id?: string; code: string; message: string; retryable: boolean };
export type ChatTurn = { id: string; role: "user" | "assistant"; text: string; source_ids: string[] };

export const phase7aActivitySchema = z.custom<Phase7AActivity>((value) => Boolean(value && typeof value === "object" && "id" in value && "status" in value));
export const phase7aMessageSchema = z.custom<Phase7AAssistantMessage>((value) => Boolean(value && typeof value === "object" && "message_id" in value && "text" in value));
export const phase7aSourceSchema = z.custom<BrowserSource>((value) => Boolean(value && typeof value === "object" && "source_id" in value && "source_type" in value));
export const phase7aArtifactSchema = z.object({ run_id: z.string(), revision: z.number(), artifact: z.custom<BrowserArtifact>() });
export const phase7aRunSchema = z.custom<Phase7ARun>((value) => Boolean(value && typeof value === "object" && "run_id" in value && "state" in value));
export const phase7aReceiptSchema = z.custom<Phase7AReceipt>((value) => Boolean(value && typeof value === "object" && "counts" in value && "status" in value));
export const phase7aErrorSchema = z.custom<Phase7AError>((value) => Boolean(value && typeof value === "object" && "code" in value && "message" in value));

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
