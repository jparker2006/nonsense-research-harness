import type { BrowserArtifact, BrowserSource, Phase7AActivity, Phase7AError, Phase7AReceipt, Phase7ARun } from "./client.ts";

export type SourceReference = {
  source_id: string;
  number: number;
  publisher: string;
  title: string;
  compact_label: string;
  accessible_label: string;
  url?: string;
  source: BrowserSource;
};

export type ObservableWorkGroup = {
  id: string;
  label: string;
  detail: string;
  status: Phase7AActivity["status"];
  activities: Phase7AActivity[];
};

const PUBLISHERS: Array<[string, string]> = [
  ["cdc.gov", "CDC"],
  ["fda.gov", "FDA"],
  ["fsis.usda.gov", "USDA FSIS"],
  ["usda.gov", "USDA"],
  ["apnews.com", "AP"],
  ["reuters.com", "Reuters"],
  ["nasa.gov", "NASA"],
  ["nih.gov", "NIH"],
];

function hostname(source: BrowserSource): string | null {
  if (!source.url) return null;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function sourcePublisher(source: BrowserSource): string {
  if (source.source_type === "archive") {
    if (source.season && source.episode_number) return `S${source.season}E${source.episode_number}`;
    if (source.season) return `Season ${source.season}`;
    return "Nonsense archive";
  }
  const host = hostname(source);
  if (!host) return source.source_type === "provided_link" ? "Provided article" : "Web source";
  return PUBLISHERS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1] ?? host;
}

function resolvedSource(id: string, sources: Record<string, BrowserSource>, ledger: BrowserSource[]): BrowserSource {
  return sources[id] ?? ledger.find((source) => source.source_id === id) ?? {
    source_id: id,
    source_type: "web",
    availability: "unavailable",
    evidence_usable: false,
    title: "Source details unavailable",
  };
}

export function buildSourceReferences(
  ids: string[],
  sources: Record<string, BrowserSource>,
  ledger: BrowserSource[] = [],
): SourceReference[] {
  const unique = [...new Set(ids)];
  return unique.map((id, index) => {
    const source = resolvedSource(id, sources, ledger);
    const publisher = sourcePublisher(source);
    const title = source.title?.trim() || (source.source_type === "archive" ? "Nonsense episode" : hostname(source) ?? "Web source");
    const number = index + 1;
    return {
      source_id: id,
      number,
      publisher,
      title,
      compact_label: `[${number}] ${publisher} · ${title}`,
      accessible_label: `Source ${number}: ${publisher} — ${title}`,
      ...(source.url ? { url: source.url } : {}),
      source,
    };
  });
}

export function referencesForArtifact(
  artifact: BrowserArtifact,
  sources: Record<string, BrowserSource> = {},
): SourceReference[] {
  return buildSourceReferences(artifact.source_ledger.map((source) => source.source_id), sources, artifact.source_ledger);
}

export function referenceMap(references: SourceReference[]): Map<string, SourceReference> {
  return new Map(references.map((reference) => [reference.source_id, reference]));
}

export function humanizeMachineReferences(text: string, references: SourceReference[]): string {
  let readable = text;
  for (const reference of [...references].sort((a, b) => b.source_id.length - a.source_id.length)) {
    readable = readable.split(reference.source_id).join(`[${reference.number}] ${reference.publisher}`);
  }
  return readable.replace(/\b(?:web|archive)_[a-z0-9:_-]+\b/gi, "a retrieved source");
}

export function limitationLabel(limitation: string): string {
  const labels: Record<string, string> = {
    "archive:keyword_only": "Archive search used keyword matching only.",
    phase7a_model_unavailable: "The planning model was unavailable.",
    phase7a_web_search_limit: "The turn reached its web-search boundary.",
    phase7a_provider_request_limit: "The turn reached its provider-request boundary.",
    phase7a_budget_exhausted: "The turn reached its cost boundary.",
  };
  return labels[limitation] ?? limitation.replace(/^phase7a_/, "").replaceAll("_", " ");
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function unavailableSourceCount(activities: Phase7AActivity[]): number {
  return activities.filter((activity) => activity.status === "unavailable" && activity.tool === "read_url").length;
}

export function outcomeLabel(
  run: Phase7ARun | null,
  receipt: Phase7AReceipt | null,
  activities: Phase7AActivity[],
  error: Phase7AError | null = null,
): string {
  if (error && !run) return "Failed safely";
  if (!run || run.state === "running") return activities.at(-1)?.label ?? "Working";
  if (run.state === "failed") return "Failed safely";
  if (run.state === "stopped") return "Stopped";
  if (run.state === "complete") return "Ready";
  const unavailable = unavailableSourceCount(activities);
  if (unavailable) return `Ready · ${unavailable} source${unavailable === 1 ? "" : "s"} unavailable`;
  if (receipt?.limitations.some((item) => item === "archive:keyword_only")) return "Ready · archive search limited";
  return "Ready · limitations noted";
}

export function researchReceiptSummary(receipt: Phase7AReceipt | null): string {
  if (!receipt) return "Observable work";
  const work: string[] = [];
  if (receipt.counts.web_searches) work.push(`${receipt.counts.web_searches} web search${receipt.counts.web_searches === 1 ? "" : "es"}`);
  if (receipt.counts.url_reads) work.push(`${receipt.counts.url_reads} source read${receipt.counts.url_reads === 1 ? "" : "s"}`);
  if (receipt.counts.transcript_searches) work.push("archive searched");
  if (receipt.counts.transcript_opens) work.push(`${receipt.counts.transcript_opens} archive passage${receipt.counts.transcript_opens === 1 ? "" : "s"}`);
  if (receipt.counts.compositions) work.push("packet written");
  const action = work.length ? `Researched ${work.join(", ")}` : "Answered from the conversation";
  return `${action} · ${formatElapsed(receipt.elapsed_ms)} · ${receipt.counts.provider_requests} request${receipt.counts.provider_requests === 1 ? "" : "s"} · $${receipt.accounted_cost_usd.toFixed(4)}`;
}

function groupStatus(activities: Phase7AActivity[]): Phase7AActivity["status"] {
  if (activities.some((item) => item.status === "running")) return "running";
  if (activities.some((item) => item.status === "failed")) return "failed";
  if (activities.some((item) => item.status === "stopped")) return "stopped";
  if (activities.some((item) => item.status === "unavailable")) return "unavailable";
  if (activities.some((item) => item.status === "partial")) return "partial";
  return "complete";
}

function workLabel(activities: Phase7AActivity[]): string {
  const first = activities[0]!;
  if (first.tool === "web_search") {
    if (activities.some((item) => item.status === "running")) return "Searching the web";
    const candidates = activities.map((item) => /·\s*(\d+)\s+candidate/.exec(item.detail)?.[1]).find(Boolean);
    return candidates ? `Searched the web across ${candidates} results` : "Searched the web";
  }
  if (first.tool === "read_url") {
    if (activities.length > 1) return `Read ${activities.length} sources`;
    const title = first.detail.split(" · ")[0]?.trim();
    return title && !title.includes(".") ? `Read ${title}` : "Read a source";
  }
  if (first.tool === "search_transcripts") return "Checked the Nonsense archive";
  if (first.tool === "open_transcript_chunk") {
    return activities.length === 1 ? "Opened a past episode passage" : `Opened ${activities.length} past episode passages`;
  }
  if (first.kind === "artifact" || first.kind === "composition") {
    const mode = first.detail.toLowerCase().includes("big story") ? "Big Story" : "Headlines";
    return first.status === "running" ? `Creating the ${mode} brief` : `Created the ${mode} brief`;
  }
  if (first.kind === "validation") return "Checked the preparation brief";
  return first.label;
}

export function groupObservableWork(activities: Phase7AActivity[], running = false): ObservableWorkGroup[] {
  const groups: ObservableWorkGroup[] = [];
  let lastKey = "";
  for (const activity of activities) {
    if (activity.kind === "run") continue;
    const semantic = activity.tool ?? activity.kind;
    const key = activity.kind === "agent" ? `agent:${activity.id}` : semantic;
    const current = key === lastKey ? groups.at(-1) : undefined;
    if (current) {
      current.activities.push(activity);
      current.status = groupStatus(current.activities);
      current.label = workLabel(current.activities);
      current.detail = current.activities.map((item) => item.detail).filter(Boolean).join(" · ");
    } else {
      const next: ObservableWorkGroup = {
        id: `work_${activity.id}`,
        label: workLabel([activity]),
        detail: activity.detail,
        status: activity.status,
        activities: [activity],
      };
      groups.push(next);
      lastKey = key;
    }
  }
  if (!groups.length && running) {
    groups.push({ id: "work_planning", label: "Planning the research", detail: "Reviewing the request and saved evidence", status: "running", activities: [] });
  }
  return groups;
}

function citation(ids: string[], map: Map<string, SourceReference>): string {
  const labels = ids.flatMap((id) => map.get(id)?.number ?? []);
  return labels.length ? ` ${labels.map((number) => `[${number}]`).join(" ")}` : "";
}

function outlineLines(
  beats: Array<{ priority: string; text: string; source_ids: string[] }>,
  map: Map<string, SourceReference>,
): string[] {
  return beats.map((beat) => `- **${beat.priority.replaceAll("_", " ")}** — ${beat.text}${citation(beat.source_ids, map)}`);
}

export function artifactToReadableMarkdown(artifact: BrowserArtifact): string {
  const references = referencesForArtifact(artifact);
  const map = referenceMap(references);
  const readable = (text: string) => humanizeMachineReferences(text, references);
  const lines = [`# ${artifact.working_title}`, ""];
  if (artifact.mode === "headlines") {
    lines.push(
      "## What happened",
      `${readable(artifact.what_happened.text)}${citation(artifact.what_happened.source_ids, map)}`,
      "",
      "## Why it matters now",
      `${readable(artifact.why_it_matters_now.text)}${citation(artifact.why_it_matters_now.source_ids, map)}`,
      "",
      "## The argument",
      `${readable(artifact.tension_or_argument.text)}${citation(artifact.tension_or_argument.source_ids, map)}`,
      "",
      "## Verified facts",
      ...artifact.verified_facts.map((item) => `- ${readable(item.text)}${citation(item.source_ids, map)}`),
      "",
      "## Surprising details",
      ...artifact.surprising_details.map((item) => `- ${readable(item.text)}${citation(item.source_ids, map)}`),
      "",
      "## Editorial priorities",
      ...outlineLines(artifact.flexible_outline, map),
    );
  } else {
    lines.push(
      "## Core question",
      readable(artifact.core_question),
      "",
      "## Research brief",
      `${readable(artifact.research_brief.text)}${citation(artifact.research_brief.source_ids, map)}`,
      "",
      "## Research cards",
      ...artifact.research_cards.map((card) => `- **${card.role.replaceAll("_", " ")}** — ${readable(card.text)}${citation(card.source_ids, map)}`),
      "",
      "## Editorial priorities",
      ...outlineLines(artifact.modular_outline, map),
    );
  }
  lines.push("", "## Conversation questions", ...artifact.conversation_questions.map((item) => `- ${readable(item)}`), "", "## Past Nonsense coverage");
  if (artifact.past_nonsense_coverage.status === "matches") {
    lines.push(...artifact.past_nonsense_coverage.items.map((item) => `> ${readable(item.quote)}${citation([item.source_id], map)}`));
  } else {
    lines.push("No relevant archive match was found. No speaker attribution was invented.");
  }
  lines.push("", "## Open checks", ...artifact.uncertainties_and_open_checks.map((item) => `- ${readable(item)}`), "", "## References");
  for (const reference of references) {
    const title = reference.url ? `[${reference.title}](${reference.url})` : reference.title;
    lines.push(`${reference.number}. ${title} — ${reference.publisher} · ${reference.source.availability}`);
  }
  return `${humanizeMachineReferences(lines.join("\n"), references)}\n`;
}
