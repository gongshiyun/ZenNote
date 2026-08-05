/**
 * Workspace-wide search orchestration.
 *
 * Primary path: the Rust `search_workspace` command (parallel, no per-file IPC
 * round-trips). Fallback: a JS traversal kept for compatibility with older
 * backends that don't register the command (e.g. running a v0.8.1 binary
 * against a newer frontend during development).
 *
 * Results are cached per (workspace, query, options) so repeated opens and
 * re-renders don't re-scan the disk; the cache is dropped when the workspace
 * changes.
 */
import * as fs from "../services";

export interface WsSearchResult {
  filePath: string;
  fileName: string;
  /** 1-based line number; 0 means the file NAME matched (no content line). */
  line: number;
  /** Matched line preview (truncated), or empty for file-name hits. */
  content: string;
}

export interface WsSearchOptions {
  caseSensitive?: boolean;
}

interface CacheEntry {
  workspace: string;
  key: string;
  results: WsSearchResult[];
}

const MAX_CACHE_ENTRIES = 40;
let cache: CacheEntry[] = [];
let cacheWorkspace: string | null = null;

function cacheKey(query: string, opts: WsSearchOptions): string {
  return query + "\u0000" + (opts.caseSensitive ? "cs" : "ci");
}

export function clearWorkspaceSearchCache(): void {
  cache = [];
  cacheWorkspace = null;
}

/** Legacy JS traversal (used when the Rust command is unavailable). */
async function legacySearch(workspacePath: string, query: string, opts: WsSearchOptions): Promise<WsSearchResult[]> {
  const tree = await fs.openWorkspace(workspacePath);
  const found: WsSearchResult[] = [];
  const q = opts.caseSensitive ? query : query.toLowerCase();

  const searchNode = async (node: any): Promise<void> => {
    if (node.isDir) {
      if (node.children) for (const c of node.children) await searchNode(c);
      return;
    }
    if (!node.name.endsWith(".md")) return;
    // File-name hit.
    const name = opts.caseSensitive ? node.name : node.name.toLowerCase();
    if (name.includes(q)) {
      found.push({ filePath: node.path, fileName: node.name, line: 0, content: "" });
    }
    try {
      const content = await fs.readFile(node.path);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = opts.caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (line.includes(q)) {
          found.push({
            filePath: node.path, fileName: node.name,
            line: i + 1, content: lines[i].trim().substring(0, 120),
          });
          if (found.length >= 500) return;
        }
      }
    } catch { /* unreadable file: skip */ }
  };

  for (const n of tree) {
    await searchNode(n);
    if (found.length >= 500) break;
  }
  return found;
}

/**
 * Search all markdown files in the workspace (file names + content).
 * Returns at most 500 results.
 */
export async function searchWorkspace(
  workspacePath: string,
  query: string,
  opts: WsSearchOptions = {},
): Promise<WsSearchResult[]> {
  if (!workspacePath || !query) return [];

  // Reset the cache whenever the workspace changed.
  if (cacheWorkspace !== workspacePath) {
    cache = [];
    cacheWorkspace = workspacePath;
  }
  const key = cacheKey(query, opts);
  const hit = cache.find(e => e.key === key);
  if (hit) return hit.results;

  let results: WsSearchResult[];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    results = await invoke<WsSearchResult[]>("search_workspace", {
      path: workspacePath,
      query,
      caseSensitive: !!opts.caseSensitive,
    });
  } catch {
    // Command not registered (older backend) or IPC failure — fall back to JS.
    results = await legacySearch(workspacePath, query, opts);
  }

  cache.push({ workspace: workspacePath, key, results });
  if (cache.length > MAX_CACHE_ENTRIES) cache.shift();
  return results;
}
