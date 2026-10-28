import { isWindowsPath, normalizePathForCompare } from "../domain/filesystem";

function preferredSeparator(base: string): string {
  const backslash = base.lastIndexOf("\\");
  const slash = base.lastIndexOf("/");
  return backslash > slash ? "\\" : "/";
}

export function joinPath(base: string, name: string): string {
  if (!base) return name;
  const separator = preferredSeparator(base);
  return base.endsWith("/") || base.endsWith("\\")
    ? base + name
    : base + separator + name;
}

export function replaceFileName(path: string, name: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index < 0 ? name : path.slice(0, index + 1) + name;
}

/**
 * Character-wise prefix match that tolerates separator style and Windows case.
 *
 * Returns the suffix after `prefix` (the separator between them collapsed), or
 * null when `path` is not `prefix` or inside it. Compared to a plain
 * `startsWith`, this treats `c:/notes/x.md` as inside `C:\Notes` while
 * `C:\Notes2\x.md` stays outside. `..` is not resolved here: a path whose first
 * suffix segment is `..` is not a descendant identity (see `remapPathPrefix`).
 */
function matchPrefix(path: string, prefix: string): string | null {
  if (!prefix) return null;
  const caseInsensitive = isWindowsPath(path) || isWindowsPath(prefix);
  let i = 0;
  let j = 0;
  while (j < prefix.length) {
    if (i >= path.length) return null;
    const pathChar = path[i];
    const prefixChar = prefix[j];
    const pathSep = pathChar === "\\" || pathChar === "/";
    const prefixSep = prefixChar === "\\" || prefixChar === "/";
    if (pathSep || prefixSep) {
      if (!pathSep || !prefixSep) return null;
      while (i < path.length && (path[i] === "\\" || path[i] === "/")) i++;
      while (j < prefix.length && (prefix[j] === "\\" || prefix[j] === "/")) j++;
      continue;
    }
    if (caseInsensitive ? pathChar.toLowerCase() !== prefixChar.toLowerCase() : pathChar !== prefixChar) {
      return null;
    }
    i++;
    j++;
  }
  if (i >= path.length) return "";
  const prefixEndsWithSeparator = prefix.length > 0 && /[\\/]/.test(prefix[prefix.length - 1]);
  if (!prefixEndsWithSeparator && path[i] !== "\\" && path[i] !== "/") return null;
  while (i < path.length && (path[i] === "\\" || path[i] === "/")) i++;
  return path.slice(i);
}

/** Keep open-tab identity in sync after a rename/move (Windows case-insensitive). */
export function remapPathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  const suffix = matchPrefix(path, oldPrefix);
  if (suffix === null) return path;
  if (suffix === "") return newPrefix;
  // `C:\Notes\..\secret.md` is not a child of `C:\Notes`; leave it untouched.
  if (suffix === ".." || suffix.startsWith("../") || suffix.startsWith("..\\")) return path;
  const separator = preferredSeparator(newPrefix);
  return newPrefix.endsWith("/") || newPrefix.endsWith("\\")
    ? newPrefix + suffix
    : newPrefix + separator + suffix;
}

/**
 * Every open path inside (or equal to) a deleted/renamed target.
 *
 * Canonical comparison so a drive-letter or separator difference cannot leave a
 * stale tab pointing at a removed file.
 */
export function affectedOpenPaths(openTabs: string[], targetPath: string): string[] {
  const target = normalizePathForCompare(targetPath);
  if (!target) return openTabs.filter(path => path === targetPath);
  const targetPrefix = target.endsWith("/") ? target : target + "/";
  return openTabs.filter(path => {
    const normalized = normalizePathForCompare(path);
    return normalized === target || normalized.startsWith(targetPrefix);
  });
}
