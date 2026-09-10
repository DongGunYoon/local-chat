import { describe, expect, it } from "vitest";
import { isNewerVersion, parseVersion } from "../../src/utils/version.js";

describe("parseVersion", () => {
  it("parses plain, v-prefixed and pre-release versions", () => {
    expect(parseVersion("0.2.1")).toEqual({ parts: [0, 2, 1], prerelease: false });
    expect(parseVersion("v1.10.0")).toEqual({ parts: [1, 10, 0], prerelease: false });
    expect(parseVersion("1.0.0-beta.2+build.5")).toEqual({ parts: [1, 0, 0], prerelease: true });
  });

  it("rejects text that is not a version", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("is true only when the candidate is strictly newer", () => {
    expect(isNewerVersion("0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
  });

  it("never advertises an older registry version to a newer local build", () => {
    expect(isNewerVersion("0.2.0", "0.2.1")).toBe(false);
    expect(isNewerVersion("0.1.2", "0.2.0")).toBe(false);
  });

  it("orders a pre-release before its release", () => {
    expect(isNewerVersion("0.3.0", "0.3.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.3.0-beta.1", "0.3.0")).toBe(false);
  });

  it("stays quiet on unparsable input", () => {
    expect(isNewerVersion("latest", "0.2.1")).toBe(false);
    expect(isNewerVersion("0.2.2", "dev")).toBe(false);
  });
});
