import { describe, expect, it } from "vitest";

import {
  colorSchemeReport,
  isColorSchemeQuery,
  isColorSchemeReportMode,
  primaryParam,
  schemeReport,
} from "./colorScheme";

describe("primaryParam", () => {
  it("reads plain, sub-parameter and empty parameter lists", () => {
    expect(primaryParam([2031])).toBe(2031);
    expect(primaryParam([[2031, 1]])).toBe(2031);
    expect(primaryParam([])).toBeNull();
  });
});

describe("mode detection", () => {
  it("recognises the 2031 subscription and nothing else", () => {
    expect(isColorSchemeReportMode([2031])).toBe(true);
    // Neighbouring DEC private modes must not be hijacked.
    expect(isColorSchemeReportMode([2004])).toBe(false); // bracketed paste
    expect(isColorSchemeReportMode([1049])).toBe(false); // alternate screen
    expect(isColorSchemeReportMode([25])).toBe(false); // cursor visible
    expect(isColorSchemeReportMode([])).toBe(false);
  });

  it("recognises the 996 polarity query and nothing else", () => {
    expect(isColorSchemeQuery([996])).toBe(true);
    expect(isColorSchemeQuery([997])).toBe(false); // a report is not a query
    expect(isColorSchemeQuery([6])).toBe(false); // cursor position report
    expect(isColorSchemeQuery([])).toBe(false);
  });
});

describe("colorSchemeReport", () => {
  it("emits the CSI ? 997 sequence for each polarity", () => {
    expect(colorSchemeReport(true)).toBe("\x1b[?997;1n");
    expect(colorSchemeReport(false)).toBe("\x1b[?997;2n");
  });
});

describe("schemeReport", () => {
  it("answers with the current polarity once the program subscribes", () => {
    expect(schemeReport(true, null, true)).toBe("\x1b[?997;1n");
    expect(schemeReport(true, null, false)).toBe("\x1b[?997;2n");
  });

  it("stays silent when the program never subscribed", () => {
    expect(schemeReport(false, null, true)).toBeNull();
    expect(schemeReport(false, true, false)).toBeNull();
    expect(schemeReport(false, false, true)).toBeNull();
  });

  it("reports only on a polarity flip", () => {
    // dark → light, then light → dark.
    expect(schemeReport(true, true, false)).toBe("\x1b[?997;2n");
    expect(schemeReport(true, false, true)).toBe("\x1b[?997;1n");
  });

  it("stays silent when the polarity is unchanged", () => {
    expect(schemeReport(true, true, true)).toBeNull();
    expect(schemeReport(true, false, false)).toBeNull();
  });

  it("keeps the query answer consistent with the subscription report", () => {
    // A CSI ? 996 n answer is just a forced report of the current polarity.
    for (const dark of [true, false]) {
      expect(schemeReport(true, null, dark)).toBe(colorSchemeReport(dark));
    }
  });
});
