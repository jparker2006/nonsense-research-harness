import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Phase 4 live evidence and lock", () => {
  it("preserves the one-request partial live proof within every approved ceiling", async () => {
    const report = JSON.parse(await readFile(resolve(root, "reports/phase-4-live.json"), "utf8"));
    expect(report).toMatchObject({
      phase: 4,
      status: "partial",
      limits: {
        approved_budget_usd: 0.1,
        provider_requests: 1,
        searches: 1,
        top_level_url_reads: 1,
        http_requests_including_redirects: 4,
        retries: 0,
      },
      usage: {
        provider_requests: 1,
        top_level_url_reads: 1,
        reported_cost_usd: null,
        conservative_cost_upper_bound_usd: 0.02,
      },
      search: {
        status: "unavailable",
        engine: "perplexity",
        result_count: 0,
        citations: [],
        failure: { code: "provider_unavailable" },
      },
      read: {
        availability: "complete",
        evidence_usable: true,
        receipt: { http_status: 200, http_requests: 1, redirects: 0 },
      },
    });
    expect(report.usage.conservative_cost_upper_bound_usd).toBeLessThanOrEqual(
      report.limits.approved_budget_usd,
    );
    expect(report.read.receipt.http_requests).toBeLessThanOrEqual(
      report.limits.http_requests_including_redirects,
    );
    expect(report.read).not.toHaveProperty("text");
    expect(JSON.stringify(report)).not.toMatch(/OPENROUTER_API_KEY|Bearer\s+|sk-or-/i);
  });

  it("locks the only Phase 4 live-call script after evidence generation", async () => {
    const script = await readFile(resolve(root, "scripts/run-phase4-live.ts"), "utf8");
    expect(script).toContain("export const PHASE_4_LIVE_CALLS_DISABLED = true;");
    expect(script).not.toContain("PHASE_4_LIVE_CALLS_DISABLED = false");
  });

  it("keeps every native-Node live module compatible with strip-only TypeScript", () => {
    const files = [
      "scripts/run-phase4-live.ts",
      "src/lib/web-research/contracts.ts",
      "src/lib/web-research/network-policy.ts",
      "src/lib/web-research/extraction.ts",
      "src/lib/web-research/read-url.ts",
      "src/lib/web-research/web-search.ts",
    ];
    for (const file of files) {
      expect(() =>
        execFileSync(process.execPath, ["--check", resolve(root, file)], {
          stdio: "pipe",
        }),
      ).not.toThrow();
    }
  });
});
