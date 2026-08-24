import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { mastraRuntimeName } from "@/lib/mastra-spike";
import {
  MOCK_ACTIVITIES,
  MOCK_ARTIFACT,
  type NonsenseUIMessage,
} from "@/lib/mock-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function POST(request: Request) {
  // Read and bound the request even though Phase 1 deliberately ignores its
  // content. Phase 2 will replace this fixture with the pinned live model.
  const body = await request.text();
  if (body.length > 100_000) {
    return Response.json({ error: "Mock request is too large." }, { status: 413 });
  }

  const runId = `run_${generateId()}`;
  const stream = createUIMessageStream<NonsenseUIMessage>({
    execute: async ({ writer }) => {
      writer.write({
        type: "data-run",
        id: runId,
        data: {
          runId,
          state: "run_started",
          summary: "Mock research run started",
          runtime: mastraRuntimeName,
        },
      });

      writer.write({
        type: "tool-input-start",
        toolCallId: "read-supplied-story",
        toolName: "read_url",
      });
      writer.write({
        type: "tool-input-available",
        toolCallId: "read-supplied-story",
        toolName: "read_url",
        input: { url: "https://example.com/supplied-story" },
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[0].id, data: { ...MOCK_ACTIVITIES[0], status: "running" } });
      await wait(260);
      writer.write({
        type: "tool-output-available",
        toolCallId: "read-supplied-story",
        output: { title: "The machine that would not retire", extractedCharacters: 8421 },
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[0].id, data: MOCK_ACTIVITIES[0] });

      writer.write({
        type: "tool-input-start",
        toolCallId: "search-archive",
        toolName: "search_transcripts",
      });
      writer.write({
        type: "tool-input-available",
        toolCallId: "search-archive",
        toolName: "search_transcripts",
        input: { query: "obsolete technology that survives", limit: 5 },
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[1].id, data: { ...MOCK_ACTIVITIES[1], status: "running" } });
      await wait(320);
      writer.write({
        type: "tool-output-available",
        toolCallId: "search-archive",
        output: { matches: 2, episodeIds: ["s4-e07", "s3-e12"] },
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[1].id, data: MOCK_ACTIVITIES[1] });

      writer.write({
        type: "tool-input-start",
        toolCallId: "read-paywalled-source",
        toolName: "read_url",
      });
      writer.write({
        type: "tool-input-available",
        toolCallId: "read-paywalled-source",
        toolName: "read_url",
        input: { url: "https://example.com/paywalled-source" },
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[2].id, data: { ...MOCK_ACTIVITIES[2], status: "running" } });
      await wait(240);
      writer.write({
        type: "tool-output-error",
        toolCallId: "read-paywalled-source",
        errorText: "Page unavailable: paywall prevented retrieval; source excluded.",
      });
      writer.write({ type: "data-activity", id: MOCK_ACTIVITIES[2].id, data: MOCK_ACTIVITIES[2] });

      const textId = "composition-summary";
      writer.write({ type: "text-start", id: textId });
      writer.write({
        type: "text-delta",
        id: textId,
        delta:
          "Research packet assembled. One unavailable source was excluded, and two archive matches were preserved without speaker attribution.",
      });
      writer.write({ type: "text-end", id: textId });

      writer.write({ type: "data-artifact", id: "artifact-v0", data: MOCK_ARTIFACT });
      writer.write({
        type: "data-run",
        id: runId,
        data: {
          runId,
          state: "run_completed",
          summary: "Mock research packet ready",
          runtime: mastraRuntimeName,
        },
      });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: () => "The mock stream failed safely.",
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-store",
      "X-Nonsense-Mode": "phase-1-mock",
    },
  });
}
