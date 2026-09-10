import { describe, expect, it } from "vitest";

import { parseOsc1337File } from "./oscImages";

describe("parseOsc1337File", () => {
  it("decodes inline images with headers", () => {
    // 1x1 transparent PNG
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const img = parseOsc1337File(`File=name=dot.png;size=94;inline=1:${b64}`);
    expect(img).not.toBeNull();
    expect(img!.name).toBe("dot.png");
    expect(img!.mime).toBe("image/png");
    expect(img!.bytes.length).toBeGreaterThan(50);
    // PNG magic
    expect([...img!.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rejects downloads (inline=0) and malformed payloads", () => {
    expect(parseOsc1337File("File=name=x.png;size=1;inline=0:AAAA")).toBeNull();
    expect(parseOsc1337File("no-colon-here")).toBeNull();
    expect(parseOsc1337File("File=name=x.png;inline=1:!!!notbase64")).toBeNull();
  });
});
