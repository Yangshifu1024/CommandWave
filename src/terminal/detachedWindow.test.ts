import { describe, expect, it } from "vitest";

import { decodeDetachParam, encodeDetachParam } from "./detachedWindow";

describe("detach param", () => {
  it("round-trips pane identity", () => {
    const info = {
      paneId: "pane-42",
      ptyId: 7,
      cwd: "/tmp/ünïcode",
    };
    expect(decodeDetachParam(encodeDetachParam(info))).toEqual(info);
  });

  it("rejects malformed params", () => {
    expect(decodeDetachParam("!!!not-base64!!!")).toBeNull();
    expect(decodeDetachParam(encodeDetachParam({ paneId: 5, ptyId: "x" } as never))).toBeNull();
  });
});
