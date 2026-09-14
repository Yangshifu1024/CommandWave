import { beforeEach, describe, expect, it } from "vitest";

import type { PaneNode } from "../layout/paneTree";
import {
  attentionCount,
  isAttentionState,
  paneStatus,
  panesInState,
  tabAttentionState,
  useAgentStore,
} from "./statusStore";

const store = () => useAgentStore.getState();

beforeEach(() => store().reset());

describe("agent status store", () => {
  it("registers an agent and keeps its state on re-upsert", () => {
    store().upsert("p1", "claude", "Claude Code");
    store().setState("p1", "needs-you");
    store().upsert("p1", "claude", "Claude Code");
    expect(paneStatus("p1")?.state).toBe("needs-you");
  });

  it("ignores activity for panes with no agent", () => {
    store().noteActivity("unknown", "hi");
    expect(paneStatus("unknown")).toBeUndefined();
  });

  it("accumulates a bounded output tail", () => {
    store().upsert("p1", "codex", "Codex CLI");
    store().noteActivity("p1", "hello ");
    store().noteActivity("p1", "world");
    expect(paneStatus("p1")?.tail).toBe("hello world");
  });

  it("removes panes", () => {
    store().upsert("p1", "claude", "Claude Code");
    store().remove("p1");
    expect(paneStatus("p1")).toBeUndefined();
  });
});

describe("selectors", () => {
  it("counts only blocking states toward attention", () => {
    store().upsert("p1", "claude", "Claude Code");
    store().upsert("p2", "codex", "Codex CLI");
    store().upsert("p3", "gemini", "Gemini CLI");
    store().setState("p1", "needs-you");
    store().setState("p2", "error");
    store().setState("p3", "done");
    const panes = store().panes;
    expect(attentionCount(panes)).toBe(2);
    expect(isAttentionState("done")).toBe(true);
    expect(isAttentionState("working")).toBe(false);
  });

  it("orders panes in a state by recency", () => {
    store().upsert("p1", "claude", "Claude Code");
    store().upsert("p2", "codex", "Codex CLI");
    store().setState("p1", "needs-you");
    store().setState("p2", "needs-you");
    const waiting = panesInState(store().panes, ["needs-you"]);
    expect(waiting).toHaveLength(2);
  });

  it("picks the highest-urgency pane in a tab", () => {
    store().upsert("p1", "claude", "Claude Code");
    store().upsert("p2", "codex", "Codex CLI");
    store().setState("p1", "working");
    store().setState("p2", "error");
    const root: PaneNode = { type: "pane", id: "p1" };
    const state = tabAttentionState(root, store().panes, () => ["p1", "p2"]);
    expect(state).toBe("error");
  });

  it("returns null for a tab with no agent panes", () => {
    const root: PaneNode = { type: "pane", id: "plain" };
    expect(tabAttentionState(root, store().panes, () => ["plain"])).toBeNull();
  });
});
