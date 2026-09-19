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

const REAL_EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Ansi 0 Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.3529</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.2784</real>
		<key>Red Component</key>
		<real>0.2706</real>
	</dict>
	<key>Bold Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.5</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.5</real>
		<key>Red Component</key>
		<real>0.5</real>
	</dict>
	<key>Background Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.1804</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.1176</real>
		<key>Red Component</key>
		<real>0.1176</real>
	</dict>
	<key>Cursor Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.8627</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.8784</real>
		<key>Red Component</key>
		<real>0.9608</real>
	</dict>
	<key>Cursor Text Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.1804</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.1176</real>
		<key>Red Component</key>
		<real>0.1176</real>
	</dict>
	<key>Foreground Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.9569</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.8392</real>
		<key>Red Component</key>
		<real>0.8039</real>
	</dict>
	<key>Selected Text Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.5</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.5</real>
		<key>Red Component</key>
		<real>0.5</real>
	</dict>
	<key>Selection Color</key>
	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>0.8627</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>0.8784</real>
		<key>Red Component</key>
		<real>0.9608</real>
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

  it("parses a real iTerm2 export, extra keys and all", () => {
    // iTerm2 writes Alpha Component / Color Space into every color dict and
    // carries color keys we do not map (Bold Color, Selected Text Color).
    // Those used to end the color being collected and the whole file failed.
    const out = parseItermColors(REAL_EXPORT);
    expect(out).not.toBeNull();
    expect(out!.black).toBe("#45475a");
    expect(out!.background).toBe("#1e1e2e");
    expect(out!.foreground).toBe("#cdd6f4");
    expect(out!.cursor).toBe("#f5e0dc");
    expect(out!.cursorAccent).toBe("#1e1e2e");
    expect(out!.selectionBackground).toBe("#f5e0dc");
  });

  it("returns null for non-plist content", () => {
    expect(parseItermColors("not a plist")).toBeNull();
    expect(parseItermColors("<dict></dict>")).toBeNull();
  });
});
