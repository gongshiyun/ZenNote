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

export function remapPathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(oldPrefix + "\\") || path.startsWith(oldPrefix + "/")) {
    return newPrefix + path.slice(oldPrefix.length);
  }
  return path;
}

export function affectedOpenPaths(openTabs: string[], targetPath: string): string[] {
  return openTabs.filter(path =>
    path === targetPath ||
    path.startsWith(targetPath + "\\") ||
    path.startsWith(targetPath + "/"),
  );
}
