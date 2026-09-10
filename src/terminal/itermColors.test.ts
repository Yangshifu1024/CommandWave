import { describe, expect, it } from "vitest";

import { parseItermColors } from "./itermColors";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Ansi 0 Color</key>
	<dict>
		<key>Blue Component</key>
		<real>0.19370138645172119</real>
		<key>Green Component</key>
		<real>0.16575422883033752</real>
		<key>Red Component</key>
		<real>0.15257890522480011</real>
	</dict>
	<key>Ansi 1 Color</key>
	<dict>
		<key>Blue Component</key>
		<real>0.45777350664138794</real>
		<key>Green Component</key>
		<real>0.42278772592544556</real>
		<key>Red Component</key>
		<real>0.87843137979507446</real>
	</dict>
	<key>Background Color</key>
	<dict>
		<key>Blue Component</key>
		<real>0.13186637759208679</real>
		<key>Green Component</key>
		<real>0.15293203294277191</real>
		<key>Red Component</key>
		<real>0.14549908041954041</real>
	</dict>
	<key>Foreground Color</key>
	<dict>
		<key>Blue Component</key>
		<real>0.92941176470588238</real>
		<key>Green Component</key>
		<real>0.91764705882352937</real>
		<key>Red Component</key>
		<real>0.90980392156862744</real>
	</dict>
</dict>
</plist>`;

describe("parseItermColors", () => {
  it("parses colors from a real plist", () => {
    const out = parseItermColors(SAMPLE);
    expect(out).not.toBeNull();
    expect(out!.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(out!.foreground).toBe("#e8eaed");
    expect(out!.black).toBe("#272a31");
    expect(out!.red).toBe("#e06c75");
  });

  it("returns null for non-plist content", () => {
    expect(parseItermColors("not a plist")).toBeNull();
    expect(parseItermColors("<dict></dict>")).toBeNull();
  });
});
