/**
 * FileSystem Context — domain logic for path and workspace operations.
 */

/**
 * Extract the parent directory from a file path (handles both / and \ separators).
 */
export function parentDir(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]+$/, "");
}

/**
 * Extract the file name (last segment) from a path.
 */
export function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "";
}

/**
 * Check whether `child` is inside (or equal to) the `parent` directory.
 */
export function isWithinWorkspace(child: string, parent: string | null): boolean {
  if (!parent) return false;
  return child === parent || child.startsWith(parent + "\\") || child.startsWith(parent + "/");
}

/**
 * Derive a note name from a file path (strip .md extension).
 */
export function noteName(filePath: string): string {
  return fileName(filePath).replace(/\.md$/i, "") || "Note";
}
