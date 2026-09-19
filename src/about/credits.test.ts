import { describe, expect, it } from "vitest";

import { credits } from "./credits";

/**
 * Plain data checks on the hand-maintained credit list. There is no component
 * rendering environment in this repository, so the About window itself is not
 * covered here; these tests guard the data it displays.
 */
describe("third-party credits", () => {
  it("is not empty", () => {
    expect(credits.length).toBeGreaterThan(0);
  });

  it("gives every entry a non-empty name, version and license", () => {
    const incomplete = credits
      .filter(
        (entry) =>
          typeof entry.name !== "string" ||
          entry.name.trim() === "" ||
          typeof entry.version !== "string" ||
          entry.version.trim() === "" ||
          typeof entry.license !== "string" ||
          entry.license.trim() === "",
      )
      .map((entry) => `${entry.name || "<unnamed>"}@${entry.version || "<no version>"}`);

    expect(incomplete).toEqual([]);
  });

  it("does not repeat a component name", () => {
    const names = credits.map((entry) => entry.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect(duplicates).toEqual([]);
  });

  it("covers the components the About window must name", () => {
    // One from the frontend list, one from the Rust list.
    const names = credits.map((entry) => entry.name);

    expect(names).toContain("react");
    expect(names).toContain("tauri");
  });

  it("describes every license with a short identifier", () => {
    const licenses = [...new Set(credits.map((entry) => entry.license))];

    expect(licenses.length).toBeGreaterThan(0);
    for (const license of licenses) {
      expect(license).toMatch(/^[A-Za-z0-9.()\-+ ]+$/);
    }
  });
});
