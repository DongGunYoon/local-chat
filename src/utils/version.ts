/**
 * Minimal version ordering for the startup update check: enough to tell whether the
 * registry's latest release is newer than the running build, without a semver dependency.
 */

type ParsedVersion = { parts: number[]; prerelease: boolean };

/** Parses "1.2.3", "v1.2.3" or "1.2.3-beta.1"; null when the text is not a version. */
export function parseVersion(text: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined,
  };
}

/** True when `candidate` is a release strictly newer than `current`; false for anything unparsable. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const now = parseVersion(current);
  if (!next || !now) return false;
  for (let index = 0; index < 3; index += 1) {
    const a = next.parts[index] ?? 0;
    const b = now.parts[index] ?? 0;
    if (a !== b) return a > b;
  }
  // Same numbers: a pre-release is older than the release it precedes.
  return now.prerelease && !next.prerelease;
}
