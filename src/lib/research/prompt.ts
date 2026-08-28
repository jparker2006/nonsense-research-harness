import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(process.cwd(), "prompts", "NONSENSE_RESEARCH_AGENT.md");

export const RESEARCH_AGENT_PROMPT = readFileSync(PROMPT_PATH, "utf8").trim();

if (!RESEARCH_AGENT_PROMPT) throw new Error("research_prompt_empty");
