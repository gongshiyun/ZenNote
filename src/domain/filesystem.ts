/**
 * FileSystem Context — domain logic for path and workspace operations.
 */

/**
 * Windows-style absolute path (drive letter or UNC share).
 *
 * Windows paths are case-insensitive and accept both separators; POSIX paths are
 * case-sensitive. Every comparison helper below picks its behaviour from this.
 */
export function isWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[a-zA-Z]:$/.test(value) || value.startsWith("\\\\") || value.startsWith("//");
}

/**
 * Canonical comparison form of a path (display paths are never changed).
 *
 * Unifies separators, drops `.` and resolves `..` lexically, strips trailing
 * separators, and lowercases Windows paths (including the drive letter). This is
 * what makes `c:/notes/x.md` compare equal to `C:\Notes\x.md`, while a traversal
 * such as `C:\Notes\..\secret` is correctly seen as outside `C:\Notes`.
 */
export function normalizePathForCompare(value: string): string {
  if (!value) return value;
  const unified = value.replace(/\\/g, "/");
  const windows = /^[a-zA-Z]:\//.test(unified) || /^[a-zA-Z]:$/.test(unified) || unified.startsWith("//");

  let prefix = "";
  let rest = unified;
  const drive = /^([a-zA-Z]:)(?:\/|$)/.exec(unified);
  if (drive) {
    prefix = drive[1];
    rest = unified.slice(drive[0].length);
  } else if (unified.startsWith("//")) {
    prefix = "//";
    rest = unified.slice(2);
  } else if (unified.startsWith("/")) {
    prefix = "/";
    rest = unified.slice(1);
  }

  const segments: string[] = [];
  for (const segment of rest.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const body = segments.join("/");
  const separator =
    body && !prefix.endsWith("/") ? "/" : "";
  const rebuilt = prefix + separator + body;
  return windows ? rebuilt.toLowerCase() : rebuilt;
}

/**
 * Extract the parent directory from a file path (handles both / and \ separators).
 */
export function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return idx === -1 ? "" : filePath.slice(0, idx);
}

/**
 * Extract the file name (last segment) from a path.
 */
export function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "";
}

/**
 * Check whether `child` is inside (or equal to) the `parent` directory.
 *
 * Comparison is canonical: separator style, Windows drive-letter case and
 * `..` segments do not produce false positives/negatives (`C:\Notes2` is not
 * inside `C:\Notes`, `C:\Notes\..\x` is not inside `C:\Notes`).
 */
export function isWithinWorkspace(child: string, parent: string | null): boolean {
  if (!parent) return false;
  const normalizedChild = normalizePathForCompare(child);
  const normalizedParent = normalizePathForCompare(parent);
  if (!normalizedChild || !normalizedParent) return false;
  if (normalizedChild === normalizedParent) return true;
  return normalizedChild.startsWith(
    normalizedParent.endsWith("/") ? normalizedParent : normalizedParent + "/",
  );
}

/**
 * Derive a note name from a file path (strip .md extension).
 */
export function noteName(filePath: string): string {
  return fileName(filePath).replace(/\.md$/i, "") || "Note";
}
