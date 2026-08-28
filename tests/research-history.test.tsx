// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchHistory } from "../src/components/research-history.tsx";
import type { ResearchThreadMetadata } from "../src/lib/threads/contracts.ts";

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const threads: ResearchThreadMetadata[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Disneyland deaths", revision: 3, created_at: "2026-08-27T00:00:00.000Z", updated_at: "2026-08-28T00:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Food policy", revision: 2, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-27T00:00:00.000Z" },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    threads,
    activeThreadId: threads[0]!.id,
    close: vi.fn(),
    drawerOpen: false,
    newResearch: vi.fn(),
    openThread: vi.fn(),
    requestDelete: vi.fn(),
    confirmDeleteId: null,
    confirmDelete: vi.fn(),
    cancelDelete: vi.fn(),
    running: false,
    loading: false,
    warning: null,
    ...overrides,
  };
}

describe("Research Thread history UI", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("opens recent threads, starts blank research without deleting, and requires an explicit delete confirmation", async () => {
    const openThread = vi.fn();
    const newResearch = vi.fn();
    const requestDelete = vi.fn();
    const confirmDelete = vi.fn();
    await act(async () => root.render(createElement(ResearchHistory, props({ openThread, newResearch, requestDelete, confirmDelete }))));
    const foodPolicy = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Food policy"));
    await act(async () => foodPolicy!.click());
    expect(openThread).toHaveBeenCalledWith(threads[1]!.id);

    const newButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("New research"));
    await act(async () => newButton!.click());
    expect(newResearch).toHaveBeenCalledOnce();
    expect(confirmDelete).not.toHaveBeenCalled();

    const deleteButton = host.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${threads[0]!.title}"]`);
    await act(async () => deleteButton!.click());
    expect(requestDelete).toHaveBeenCalledWith(threads[0]!.id);
    expect(confirmDelete).not.toHaveBeenCalled();

    await act(async () => root.render(createElement(ResearchHistory, props({ confirmDeleteId: threads[0]!.id, confirmDelete }))));
    const yes = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Yes");
    await act(async () => yes!.click());
    expect(confirmDelete).toHaveBeenCalledWith(threads[0]!.id);
  });

  it("blocks switching, deletion, and New Research while a turn is active", async () => {
    const openThread = vi.fn();
    const newResearch = vi.fn();
    const requestDelete = vi.fn();
    await act(async () => root.render(createElement(ResearchHistory, props({ running: true, openThread, newResearch, requestDelete }))));
    const controls = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent?.includes("New research") || button.classList.contains("history-open") || button.classList.contains("history-delete"));
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((button) => button.disabled)).toBe(true);
    for (const control of controls) await act(async () => control.click());
    expect(openThread).not.toHaveBeenCalled();
    expect(newResearch).not.toHaveBeenCalled();
    expect(requestDelete).not.toHaveBeenCalled();
  });

  it("keeps desktop history persistent and turns it into an off-canvas drawer on narrow screens", async () => {
    const css = await readFile(resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");
    expect(css).toContain(".research-history { width: 248px");
    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain(".research-history--open { transform: translateX(0)");
    expect(css).toContain(".history-backdrop");
  });
});
