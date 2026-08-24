export type ActivityStatus = "running" | "complete" | "error";

export type ActivityEvent = {
  id: string;
  label: string;
  detail: string;
  status: ActivityStatus;
  tool: "read_url" | "web_search" | "search_transcripts";
  timecode: string;
};

export type SourceRecord = {
  id: string;
  label: string;
  type: "provided_link" | "web" | "archive";
  note: string;
};

export type MockArtifact = {
  title: string;
  mode: "headlines";
  setup: string;
  tension: string;
  beats: Array<{
    priority: "must_have" | "use_if_time" | "cut_first";
    text: string;
    sourceIds: string[];
  }>;
  archiveNote: string;
  openCheck: string;
  sources: SourceRecord[];
};

export type RunEvent = {
  runId: string;
  state: "run_started" | "run_completed";
  summary: string;
  runtime: string;
};

export type NonsenseDataParts = {
  activity: ActivityEvent;
  artifact: MockArtifact;
  run: RunEvent;
};

export type NonsenseTools = {
  read_url: {
    input: { url: string };
    output: { title: string; extractedCharacters: number };
  };
  search_transcripts: {
    input: { query: string; limit: number };
    output: { matches: number; episodeIds: string[] };
  };
};

export type NonsenseUIMessage = UIMessage<unknown, NonsenseDataParts, NonsenseTools>;

export const MOCK_ACTIVITIES: ActivityEvent[] = [
  {
    id: "activity-read",
    label: "Read the supplied story",
    detail: "Extracted the central claim and publication context.",
    status: "complete",
    tool: "read_url",
    timecode: "00:01",
  },
  {
    id: "activity-archive",
    label: "Search prior Nonsense coverage",
    detail: "Found two transcript segments with related discussion.",
    status: "complete",
    tool: "search_transcripts",
    timecode: "00:02",
  },
  {
    id: "activity-paywall",
    label: "Check a supporting article",
    detail: "The page was paywalled, so it was not used as evidence.",
    status: "error",
    tool: "read_url",
    timecode: "00:03",
  },
];

export const MOCK_ARTIFACT: MockArtifact = {
  title: "When old technology refuses to die",
  mode: "headlines",
  setup:
    "A supposedly obsolete device still survives because replacing the surrounding system costs more than keeping the relic alive.",
  tension:
    "Is this sensible maintenance, institutional cowardice, or proof that the replacement is not actually better?",
  beats: [
    {
      priority: "must_have",
      text: "Open with the absurd image: the future is being held together by a machine everyone declared dead.",
      sourceIds: ["S1"],
    },
    {
      priority: "must_have",
      text: "Explain the non-obvious constraint: replacing one device means replacing an entire chain of compatible systems.",
      sourceIds: ["S1", "A1"],
    },
    {
      priority: "use_if_time",
      text: "Compare this with the hosts' earlier discussion of technology that survives through habit rather than merit.",
      sourceIds: ["A1"],
    },
    {
      priority: "cut_first",
      text: "Broaden into other zombie technologies only if the conversation needs another example.",
      sourceIds: ["S2"],
    },
  ],
  archiveNote:
    "Two related transcript segments were found. The prototype records episode and segment IDs but makes no speaker claim.",
  openCheck:
    "One supporting article could not be retrieved. Its claim remains excluded until another source confirms it.",
  sources: [
    {
      id: "S1",
      label: "Supplied article",
      type: "provided_link",
      note: "Retrieved and used for the factual setup.",
    },
    {
      id: "A1",
      label: "Nonsense archive · S4 episode segment",
      type: "archive",
      note: "Exact archive excerpt available; no speaker attribution.",
    },
    {
      id: "S2",
      label: "Independent background source",
      type: "web",
      note: "Used only for the optional comparison beat.",
    },
  ],
};

export const STREAM_EVENT_KINDS = [
  "text-start",
  "text-delta",
  "text-end",
  "tool-input-start",
  "tool-input-available",
  "tool-output-available",
  "tool-output-error",
  "data-activity",
  "data-artifact",
  "data-run",
] as const;
import type { UIMessage } from "ai";
