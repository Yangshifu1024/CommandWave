import { describe, expect, it } from "vitest";

import { compileTriggers, feedLines, matchAutoAnswer, matchTriggers, stripAnsi, triggerNotifyTitle } from "./triggers";
import type { AutoAnswer, Trigger } from "../store/settingsStore";

function trigger(patch: Partial<Trigger> = {}): Trigger {
  return {
    id: "t1",
    regex: "error",
    caseSensitive: false,
    action: "highlight",
    param: "#ff0000",
    enabled: true,
    ...patch,
  };
}

describe("compileTriggers", () => {
  it("skips disabled and empty triggers", () => {
    const compiled = compileTriggers([
      trigger({ enabled: false }),
      trigger({ regex: "" }),
      trigger({ id: "ok" }),
    ]);
    expect(compiled).toHaveLength(1);
    expect(compiled[0].def.id).toBe("ok");
  });

  it("skips invalid regexes", () => {
    expect(compileTriggers([trigger({ regex: "(" })])).toHaveLength(0);
  });

  it("honors case sensitivity", () => {
    const cs = compileTriggers([trigger({ caseSensitive: true })]);
    expect(cs[0].re.test("ERROR")).toBe(false);
    const ci = compileTriggers([trigger({})]);
    expect(ci[0].re.test("ERROR")).toBe(true);
  });
});

describe("matchTriggers", () => {
  const compiled = compileTriggers([
    trigger(),
    trigger({ id: "t2", regex: "warning", action: "notify" }),
  ]);

  it("returns every matching trigger", () => {
    const hits = matchTriggers("ERROR: bad thing", compiled);
    expect(hits.map((h) => h.def.id)).toEqual(["t1"]);
  });

  it("returns nothing on clean lines", () => {
    expect(matchTriggers("all good", compiled)).toEqual([]);
  });

  it("matches password prompts at end of line", () => {
    const pw = compileTriggers([
      trigger({ regex: "(password|passphrase)\\s*[:：]\\s*$", action: "notify" }),
    ]);
    expect(matchTriggers("user password: ", pw)).toHaveLength(1);
    expect(matchTriggers("user password: foo bar", pw)).toHaveLength(0);
  });
});

describe("matchAutoAnswer", () => {
  const answers: AutoAnswer[] = [
    { pattern: "Are you sure\\?\\s*\\[y/N\\]", reply: "y", enabled: true },
  ];

  it("answers matching prompts", () => {
    expect(matchAutoAnswer("Are you sure? [y/N]", answers)?.reply).toBe("y");
  });

  it("ignores non-matching and invalid patterns", () => {
    expect(matchAutoAnswer("proceed", answers)).toBeNull();
    expect(matchAutoAnswer("x", [{ pattern: "(", reply: "y", enabled: true }])).toBeNull();
  });
});

describe("triggerNotifyTitle", () => {
  const texts = { fired: "Trigger fired", passwordPrompt: "Password prompt detected" };

  it("keeps a message the user typed", () => {
    expect(triggerNotifyTitle({ id: "t1", param: "Build failed" }, texts)).toBe("Build failed");
  });

  it("falls back to the generic title when the message is empty", () => {
    expect(triggerNotifyTitle({ id: "t1", param: "" }, texts)).toBe("Trigger fired");
    expect(triggerNotifyTitle({ id: "t1" }, texts)).toBe("Trigger fired");
  });

  it("translates the built-in password trigger's default message", () => {
    expect(
      triggerNotifyTitle({ id: "trigger-password", param: "Password prompt detected" }, texts),
    ).toBe("Password prompt detected");
    expect(
      triggerNotifyTitle(
        { id: "trigger-password", param: "Password prompt detected" },
        { fired: "f", passwordPrompt: "检测到密码提示" },
      ),
    ).toBe("检测到密码提示");
  });

  it("keeps an edited password-trigger message as typed", () => {
    expect(
      triggerNotifyTitle({ id: "trigger-password", param: "密码？" }, texts),
    ).toBe("密码？");
  });
});

describe("stripAnsi", () => {
  it("removes CSI color codes", () => {
    expect(stripAnsi("\x1b[31merror\x1b[0m")).toBe("error");
  });

  it("removes OSC sequences", () => {
    expect(stripAnsi("a\x1b]0;title\x07b")).toBe("ab");
    expect(stripAnsi("a\x1b]7;file://host/path\x1b\\b")).toBe("ab");
  });

  it("removes other control characters", () => {
    expect(stripAnsi("a\x08b\x07c")).toBe("abc");
  });
});

describe("feedLines", () => {
  it("splits complete lines and keeps the partial", () => {
    const r = feedLines("par", "tial\nnext li");
    expect(r.lines).toEqual(["partial"]);
    expect(r.rest).toBe("next li");
  });

  it("normalizes CRLF and CR", () => {
    expect(feedLines("", "a\r\nb\rc\n").lines).toEqual(["a", "b", "c"]);
    expect(feedLines("", "a\r\nb\rc\n").rest).toBe("");
  });
});
