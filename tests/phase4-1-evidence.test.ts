import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const canaryUrl =
  "https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/";

describe("Phase 4.1 web-search repair evidence and lock", () => {
  it("preserves every diagnostic and the exact hours-old freshness proof", async () => {
    const report = JSON.parse(
      await readFile(resolve(root, "reports/phase-4-1-web-search.json"), "utf8"),
    );
    expect(report).toMatchObject({
      phase: "4.1",
      status: "passed",
      limits: { provider_requests: 5, budget_usd: 0.2, retries_per_request: 0 },
      repair: {
        removed_unsupported_tool_choice: true,
        perplexity_live_failure: "HTTP 500 Internal Server Error",
        exa_live_failure: "HTTP 500 Internal Server Error",
        replacement_engine: "native",
      },
      canary: {
        url: canaryUrl,
        published_at: "Mon, 24 Aug 2026 04:01:00 +0000",
      },
      usage: {
        provider_requests: 5,
        reported_cost_usd: 0.049614,
        receipts_missing_cost: 3,
        unreceipted_cost_upper_bound_usd: 0.092,
        total_cost_upper_bound_usd: 0.141614,
      },
    });
    expect(report.attempts).toHaveLength(5);
    expect(report.attempts.slice(0, 2).map((attempt: { engine: string }) => attempt.engine)).toEqual([
      "perplexity",
      "exa",
    ]);
    for (const attempt of report.attempts.slice(0, 2)) {
      expect(attempt).toMatchObject({
        search_status: "unavailable",
        receipt: { http_status: 500 },
        diagnostic: { http_status: 500, provider_error_message: "Internal Server Error" },
      });
    }
    const passing = report.attempts.at(-1);
    expect(passing).toMatchObject({
      name: "freshness",
      engine: "native",
      search_status: "complete",
      result_count: 1,
      sources: [{ url: canaryUrl }],
      receipt: {
        provider_model: "x-ai/grok-4.6",
        provider_name: "xAI",
        cost_usd: 0.023394,
        web_search_proof: "citations_and_request_bound",
      },
      opened_source: {
        availability: "complete",
        final_url: canaryUrl,
        title: "What Lake Bonneville Left Behind - NASA Science",
        published_at: "2026-08-24T00:01:00-04:00",
        receipt: { http_status: 200, http_requests: 1, redirects: 0 },
      },
      freshness_canary_matched: true,
    });
    expect(report.usage.total_cost_upper_bound_usd).toBeLessThanOrEqual(
      report.limits.budget_usd,
    );
    expect(passing.opened_source).not.toHaveProperty("text");
    expect(JSON.stringify(report)).not.toMatch(/OPENROUTER_API_KEY|Bearer\s+|sk-or-/i);
  });

  it("permanently locks the live launcher and keeps it Node-compatible", async () => {
    const path = resolve(root, "scripts/run-phase4-1-web-search.ts");
    const script = await readFile(path, "utf8");
    expect(script).toContain("export const PHASE_4_1_LIVE_CALLS_DISABLED = true;");
    expect(script).not.toContain("PHASE_4_1_LIVE_CALLS_DISABLED = false");
    expect(() => execFileSync(process.execPath, ["--check", path], { stdio: "pipe" })).not.toThrow();
  });
});
