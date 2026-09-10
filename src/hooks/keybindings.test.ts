import { describe, expect, it } from "vitest";

import {
  acceleratorToDisplay,
  bindingLookup,
  defaultKeybindings,
  eventToAccelerator,
  findConflicts,
  type BindableKeyEvent,
} from "./keybindings";

function keyEvent(init: Partial<BindableKeyEvent>): BindableKeyEvent {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  };
}

describe("eventToAccelerator", () => {
  it("maps Cmd/Ctrl to CmdOrCtrl and orders modifiers canonically", () => {
    expect(
      eventToAccelerator(keyEvent({ key: "b", metaKey: true, shiftKey: true }), true),
    ).toBe("CmdOrCtrl+Shift+B");
    expect(
      eventToAccelerator(keyEvent({ key: "b", ctrlKey: true, shiftKey: true }), false),
    ).toBe("CmdOrCtrl+Shift+B");
  });

  it("normalizes arrows, punctuation and letters", () => {
    expect(eventToAccelerator(keyEvent({ key: "ArrowUp", metaKey: true }), true)).toBe(
      "CmdOrCtrl+Up",
    );
    expect(eventToAccelerator(keyEvent({ key: ",", metaKey: true }), true)).toBe("CmdOrCtrl+,");
    expect(eventToAccelerator(keyEvent({ key: "f", metaKey: true }), true)).toBe("CmdOrCtrl+F");
    expect(eventToAccelerator(keyEvent({ key: "F5", altKey: true }), true)).toBe("Alt+F5");
  });

  it("rejects bare modifiers and unmodified typing", () => {
    expect(eventToAccelerator(keyEvent({ key: "Meta", metaKey: true }), true)).toBeNull();
    expect(eventToAccelerator(keyEvent({ key: "Shift", shiftKey: true }), true)).toBeNull();
    expect(eventToAccelerator(keyEvent({ key: "a" }), true)).toBeNull();
    // Enter became bindable (maximize-pane default is Shift+Cmd+Enter).
    expect(eventToAccelerator(keyEvent({ key: "Enter", metaKey: true }), true)).toBe("CmdOrCtrl+Enter");
  });

  it("rejects the platform's inactive primary modifier", () => {
    // Cmd combo on a Windows profile and Ctrl combo on a mac profile are
    // plain typing for that platform.
    expect(eventToAccelerator(keyEvent({ key: "b", ctrlKey: true }), true)).toBeNull();
    expect(eventToAccelerator(keyEvent({ key: "b", metaKey: true }), false)).toBeNull();
  });
});

describe("acceleratorToDisplay", () => {
  it("renders mac symbols", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+B", true)).toBe("⌘⇧B");
    expect(acceleratorToDisplay("CmdOrCtrl+Up", true)).toBe("⌘↑");
    expect(acceleratorToDisplay("Alt+Space", true)).toBe("⌥Space");
    expect(acceleratorToDisplay("", true)).toBe("—");
  });

  it("renders Ctrl on other platforms", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+B", false)).toBe("Ctrl+Shift+B");
  });
});

describe("conflicts and lookup", () => {
  it("detects duplicate accelerators only", () => {
    const conflicts = findConflicts({
      a: "CmdOrCtrl+T",
      b: "CmdOrCtrl+T",
      c: "CmdOrCtrl+W",
    });
    expect(conflicts.get("CmdOrCtrl+T")).toEqual(["a", "b"]);
    expect(conflicts.size).toBe(1);
  });

  it("lookup maps accelerator back to action, skipping empties", () => {
    const lookup = bindingLookup({ a: "CmdOrCtrl+X", b: "" });
    expect(lookup.get("CmdOrCtrl+X")).toBe("a");
    expect(lookup.size).toBe(1);
  });

  it("defaults cover the canonical actions with unique accelerators", () => {
    expect(findConflicts(defaultKeybindings).size).toBe(0);
    expect(defaultKeybindings["new-tab"]).toBe("CmdOrCtrl+T");
  });
});
