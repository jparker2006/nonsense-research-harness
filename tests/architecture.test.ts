import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function filesUnder(path: string): string[] {
  return readdirSync(resolve(root, path), { recursive: true })
    .map(String)
    .filter((name) => /\.(?:ts|tsx|md)$/.test(name));
}

describe("canonical research architecture", () => {
  it("serves one direct Luna ToolLoopAgent path with the permanent tool catalog", () => {
    const route = read("src/app/api/chat/route.ts");
    const agent = read("src/lib/research/agent.ts");
    const model = read("src/lib/research/model.ts");

    expect(route).toContain('from "@/lib/research/agent"');
    expect(route).toContain("await runResearchTurn(");
    expect(route).not.toMatch(/\b(?:manager|worker|controller|fallback runtime|composer runtime)\b/i);
    expect(agent.match(/new ToolLoopAgent\(/g)).toHaveLength(1);
    expect(model).toContain('id: "openai/gpt-5.6-luna"');
    for (const toolName of [
      "set_research_goal",
      "search_web",
      "read_urls",
      "search_transcripts",
      "open_transcript_chunks",
      "create_or_update_artifact",
      "submit_answer",
    ]) {
      expect(agent).toContain(toolName);
    }
    expect(agent).toContain('toolOrder: ["set_research_goal", "search_web", "read_urls", "search_transcripts", "open_transcript_chunks", "create_or_update_artifact", "submit_answer"]');
  });

  it("loads exactly one active Markdown system prompt", () => {
    const prompts = filesUnder("prompts");
    expect(prompts).toEqual(["NONSENSE_RESEARCH_AGENT.md"]);
    expect(read("src/lib/research/prompt.ts")).toContain("NONSENSE_RESEARCH_AGENT.md");
    expect(read("prompts/NONSENSE_RESEARCH_AGENT.md")).toContain("You are the Nonsense Research Agent");
  });

  it("keeps phase-era names and removed orchestration dependencies out of executable code", () => {
    const executableRoots = ["src", "scripts", "tests"];
    const executableFiles = executableRoots.flatMap((directory) =>
      filesUnder(directory).map((name) => `${directory}/${name}`),
    );
    expect(executableFiles.filter((name) => /phase[-_.]?[0-9]/i.test(name))).toEqual([]);

    const manifest = read("package.json");
    const lockfile = read("pnpm-lock.yaml");
    expect(manifest).not.toContain("@mastra/");
    expect(lockfile).not.toContain("@mastra/");
  });
});
