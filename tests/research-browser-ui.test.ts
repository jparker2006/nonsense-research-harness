// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationThread } from "../src/components/research-thread.tsx";
import type { ResearchActivity } from "../src/lib/research/client.ts";
import type { ResearchExchange } from "../src/lib/research/client-state.ts";

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function exchange(overrides: Partial<ResearchExchange> = {}): ResearchExchange {
  return {
    local_id: "local_browser",
    run_id: "run_browser",
    user: {
      id: "user_browser",
      text: "What changed?",
      research_depth: "standard",
      created_at: "2026-08-25T00:00:00.000Z",
    },
    run: {
      session_id: "session_browser",
      run_id: "run_browser",
      state: "running",
      summary: "Researching",
    },
    activities: [],
    assistant: null,
    artifact: null,
    receipt: null,
    error: null,
    ...overrides,
  };
}

function activity(status: ResearchActivity["status"]): ResearchActivity {
  return {
    id: "activity_browser",
    run_id: "run_browser",
    kind: "tool",
    tool: "web_search",
    label: status === "running" ? "Search current web" : "Web candidates found",
    detail: "foodborne illness update · 4 candidates · complete",
    status,
    created_at: "2026-08-25T00:00:01.000Z",
  };
}

function threadProps(exchanges: ResearchExchange[], overrides: Record<string, unknown> = {}) {
  return {
    exchanges,
    sources: {},
    draft: "",
    setDraft: vi.fn(),
    researchDepth: "standard" as const,
    setResearchDepth: vi.fn(),
    send: vi.fn(),
    running: Boolean(exchanges.at(-1)?.run?.state === "running"),
    openSource: vi.fn(),
    focusArtifact: vi.fn(),
    copyArtifact: vi.fn(),
    copiedExchangeId: null,
    ...overrides,
  };
}

describe("research browser interaction contract", () => {
  let host: HTMLDivElement;
  let root: Root;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    scrollIntoView.mockReset();
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("pauses on user scroll, reveals Jump to latest only after new work, and positions the completed answer", async () => {
    const first = exchange();
    await act(async () => root.render(createElement(ConversationThread, threadProps([first]))));
    const scroller = host.querySelector<HTMLElement>(".conversation-scroll");
    expect(scroller).not.toBeNull();
    Object.defineProperties(scroller!, {
      scrollHeight: { configurable: true, value: 1_200 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 0 },
      scrollTo: { configurable: true, value: vi.fn() },
    });

    await act(async () => scroller!.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(host.textContent).not.toContain("Jump to latest");

    const withNewWork = exchange({ activities: [activity("running")] });
    await act(async () => root.render(createElement(ConversationThread, threadProps([withNewWork]))));
    const jump = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Jump to latest"));
    expect(jump).toBeTruthy();

    await act(async () => jump!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(scroller!.scrollTo).toHaveBeenCalledWith({ top: 1_200, behavior: "smooth" });

    const completed = exchange({
      run: { session_id: "session_browser", run_id: "run_browser", state: "complete", summary: "Answer ready" },
      activities: [activity("complete")],
      assistant: {
        message_id: "message_browser",
        run_id: "run_browser",
        text: "The recall expanded.",
        source_ids: [],
        blocks: [{ text: "The recall expanded.", source_ids: [] }],
        created_at: "2026-08-25T00:00:02.000Z",
      },
    });
    await act(async () => root.render(createElement(ConversationThread, threadProps([completed]))));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(host.textContent).toContain("The recall expanded.");
  });

  it("supports the separate Deep research control and Enter-to-send keyboard path", async () => {
    const setDepth = vi.fn();
    const send = vi.fn();
    await act(async () => root.render(createElement(ConversationThread, threadProps([], {
      draft: "Research the current outbreak",
      researchDepth: "deep",
      setResearchDepth: setDepth,
      send,
      running: false,
    }))));
    const deepControl = host.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    expect(deepControl?.textContent).toContain("Deep research");
    await act(async () => deepControl!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(setDepth).toHaveBeenCalledWith("standard");

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message the research agent"]');
    await act(async () => textarea!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(send).toHaveBeenCalledWith("Research the current outbreak", "deep");
  });

  it("keeps one readable active label and exposes the sweep as decoration only", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    await act(async () => root.render(createElement(ConversationThread, threadProps([exchange({ activities: [activity("running")] })]))));
    const active = host.querySelector(".work-line-label--active");
    expect(active?.textContent).toBe("Searching the web");
    expect(active?.getAttribute("data-label")).toBeNull();
    expect(active?.querySelector(".work-line-label__highlight")?.getAttribute("aria-hidden")).toBe("true");
  });
});
