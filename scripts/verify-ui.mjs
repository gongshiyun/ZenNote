#!/usr/bin/env node
/**
 * scripts/verify-ui.mjs — ZenNote visual verification pipeline.
 *
 * Zero dependencies. Starts the Vite dev server, drives Microsoft Edge headless
 * through the Chrome DevTools Protocol (Node 24's built-in WebSocket), seeds the
 * dev-only demo workspace (src/dev/demo.ts) and captures PNGs into artifacts/.
 *
 * Usage:
 *   node scripts/verify-ui.mjs                 # all 19 screenshots
 *   node scripts/verify-ui.mjs --only='03,05'  # fast iteration (PowerShell: quote!)
 *   node scripts/verify-ui.mjs --keep          # keep temp Edge profile
 *   node scripts/verify-ui.mjs --no-server     # reuse an already-running dev server
 *   node scripts/verify-ui.mjs --headed        # watch the browser (debugging)
 *
 * Exit code: 0 when every requested shot was captured, none is blank (pixel
 * analysis, not just file size), every `theme` assertion held (.dark class +
 * computed warm canvas), and no page-level console error / uncaught exception
 * was observed. 1 otherwise.
 *
 * The dev server is started with src/dev/vite.verify.config.mjs (same root and
 * plugins as vite.config.ts, plus watch-ignore globs) because a QA run happens
 * while other agents write files; their editors stage into `.tmpdir/` folders
 * that make Vite's Windows watcher die with EBUSY. `npm run dev` is unaffected.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = join(ROOT, "artifacts");
const LOG_FILE = join(ARTIFACTS, "verify-ui.log");
const SUMMARY_FILE = join(ARTIFACTS, "verify-ui-summary.json");
const APP_PORT = 5173;
// `localhost` rather than 127.0.0.1: Vite's default host resolves to ::1 on
// Windows, so an IPv4 literal cannot reach a plain `npm run dev` server. Node's
// fetch and Edge both try both families, which also keeps reusing a server that
// binds 127.0.0.1 explicitly working.
const BASE_URL = `http://localhost:${APP_PORT}`;
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
/** Narrow-ish desktop window: catches sidebars/toolbars that refuse to shrink. */
const NARROW_VIEWPORT = { width: 1100, height: 800, deviceScaleFactor: 1 };
/** Expected --zn-canvas warm paper / warm charcoal, used to verify the repaint. */
const THEME_BACKGROUND = { light: [250, 249, 245], dark: [38, 38, 36] };
/** Ink coverage floor (share of sampled pixels differing from the canvas). */
const DEFAULT_MIN_INK = 0.03;
const WELCOME_MIN_INK = 0.0015;
const MIN_PNG_BYTES = 20 * 1024;
const NODE_BIN_DIR = "D:\\software\\nodejs";
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  process.env.MSEDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

// ───────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ───────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startedAt = new Date();
const logLines = [];
function log(message) {
  const line = `${new Date().toISOString().slice(11, 19)}  ${message}`;
  logLines.push(line);
  console.log(line);
}
function logFlush() {
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(LOG_FILE, logLines.join("\n") + "\n", "utf8");
  } catch {
    /* best effort */
  }
}

function parseArgs(argv) {
  const opts = { only: null, keep: false, noServer: false, headed: false, timeout: 25000 };
  for (const arg of argv) {
    if (arg === "--keep") opts.keep = true;
    else if (arg === "--no-server") opts.noServer = true;
    else if (arg === "--headed") opts.headed = true;
    else if (arg.startsWith("--only=")) {
      opts.only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--timeout=")) {
      opts.timeout = Number(arg.slice("--timeout=".length)) || opts.timeout;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: node scripts/verify-ui.mjs [--only=03,05] [--keep] [--no-server] [--headed] [--timeout=ms]",
      );
      process.exit(0);
    }
  }
  return opts;
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function fetchJson(url, init, timeoutMs = 5000) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function waitForHttp(url, timeoutMs, isDead) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (isDead?.()) throw new Error(`server process exited (${lastError?.message ?? "no response"})`);
    await sleep(250);
  }
  throw new Error(`dev server not ready at ${url}: ${lastError?.message ?? "timeout"}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Screenshot sanity: decode the PNG and count distinct colours / off-background
// pixels. A blank page is a single flat colour; a real (even very calm) screen
// has text, borders and icons, so it always has several distinct colours.
// ───────────────────────────────────────────────────────────────────────────

function analyzePng(buffer) {
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    return { width, height, analyzed: false };
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const value = raw[pos++];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let patched;
      switch (filter) {
        case 0:
          patched = value;
          break;
        case 1:
          patched = value + left;
          break;
        case 2:
          patched = value + up;
          break;
        case 3:
          patched = value + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          patched = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          return { width, height, analyzed: false };
      }
      pixels[y * stride + x] = patched & 0xff;
    }
  }
  const bg = [pixels[0], pixels[1], pixels[2]];
  const colors = new Set();
  let offBackground = 0;
  let samples = 0;
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 90));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const index = y * stride + x * channels;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      colors.add((r >> 3 << 12) | (g >> 3 << 6) | (b >> 3));
      if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 24) {
        offBackground++;
      }
      samples++;
    }
  }
  return {
    width,
    height,
    analyzed: true,
    uniqueColors: colors.size,
    offBackgroundRatio: samples > 0 ? offBackground / samples : 0,
  };
}


function buildDevEnv() {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  env[pathKey] = `${NODE_BIN_DIR};${env[pathKey] ?? ""}`;
  env.BROWSER = "none";
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  return env;
}

async function startDevServer() {
  const state = { child: null, output: [], startedByUs: false };
  try {
    await waitForHttp(BASE_URL, 700);
    log(`reusing dev server already listening on ${BASE_URL}`);
    return state;
  } catch {
    /* not running: start one */
  }

  // The normal dev server entry point is `npm run dev` (vite.config.ts). During
  // a QA run other agents are concurrently writing files, and their editors
  // stage content in `.tmpdir/` folders that make Vite's watcher die with
  // EBUSY on Windows. We therefore launch the same Vite binary with a
  // watch-safe config (identical plugins/root) — see src/dev/vite.verify.config.mjs.
  const attempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const env = buildDevEnv();
    const viteBin = join(ROOT, "node_modules", "vite", "bin", "vite.js");
    const viteConfig = join(ROOT, "src", "dev", "vite.verify.config.mjs");
    const args = [
      viteBin,
      "--config",
      viteConfig,
      "--port",
      String(APP_PORT),
      "--strictPort",
    ];
    log(`starting dev server (attempt ${attempt}/${attempts}): vite (watch-safe config)`);
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    state.child = child;
    state.startedByUs = true;
    const output = [];
    let exited = false;
    const collect = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        output.push(line);
        if (output.length > 200) output.shift();
        if (/EBUSY|EADDRINUSE|error:|failed/i.test(line)) log(`[dev] ${line.trim().slice(0, 220)}`);
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("exit", (code) => {
      exited = true;
      if (code !== null && code !== 0) log(`[dev] exited with code ${code}`);
    });
    try {
      await waitForHttp(BASE_URL, 60000, () => exited);
      state.output = output;
      log(`dev server ready (pid ${child.pid})`);
      return state;
    } catch (error) {
      lastError = error;
      state.output = output;
      killTree(child);
      await sleep(2000);
      if (exited) {
        log(`dev server died during startup; retrying (${attempt}/${attempts})`);
      }
    }
  }
  log("dev server failed to start; last output:");
  for (const line of state.output.slice(-25)) log(`[dev] ${line}`);
  throw lastError ?? new Error("dev server failed to start");
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* already gone */
  }
}

// ───────────────────────────────────────────────────────────────────────────
// CDP client (raw WebSocket, no deps)
// ───────────────────────────────────────────────────────────────────────────

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
  }

  async connect(timeoutMs = 15000) {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    await new Promise((resolveConnect, reject) => {
      const timer = setTimeout(
        () => reject(new Error("CDP WebSocket connect timeout")),
        timeoutMs,
      );
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolveConnect();
      });
      ws.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${event?.message ?? "unknown"}`));
      });
    });
    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return;
      }
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) {
          entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        } else {
          entry.resolve(message.result ?? {});
        }
        return;
      }
      const list = this.handlers.get(message.method);
      if (list) for (const handler of list) handler(message.params ?? {}, message.sessionId);
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("CDP connection closed"));
      }
      this.pending.clear();
    });
  }

  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
  }

  send(method, params = {}, timeoutMs = 20000) {
    if (this.closed || !this.ws) return Promise.reject(new Error("CDP not connected"));
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveSend, reject, timer, method });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}

async function launchBrowser(opts) {
  const edgePath = EDGE_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!edgePath) {
    throw new Error(
      `Microsoft Edge not found. Tried:\n${EDGE_CANDIDATES.join("\n")}\nSet EDGE_PATH to the executable.`,
    );
  }
  const userDataDir = mkdtempSync(join(tmpdir(), "zennote-verify-"));
  const debugPort = await getFreePort();
  const args = [
    opts.headed ? "" : "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--metrics-recording-only",
    "--mute-audio",
    "--password-store=basic",
    "--use-mock-keychain",
    "--remote-allow-origins=*",
    "--window-size=1440,900",
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ].filter(Boolean);
  log(`launching Edge (debug port ${debugPort})`);
  const browser = spawn(edgePath, args, { stdio: "ignore", windowsHide: true });
  const version = await (async () => {
    const deadline = Date.now() + 20000;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        return await fetchJson(`http://127.0.0.1:${debugPort}/json/version`, undefined, 1500);
      } catch (error) {
        lastError = error;
        await sleep(200);
      }
    }
    throw new Error(`Edge DevTools endpoint never came up: ${lastError?.message ?? "timeout"}`);
  })();

  let target;
  try {
    target = await fetchJson(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" },
      5000,
    );
  } catch {
    target = await fetchJson(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
      undefined,
      5000,
    );
  }
  if (!target.webSocketDebuggerUrl) {
    throw new Error("Edge did not expose a page target WebSocket URL");
  }
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  log(`connected to ${version.Browser ?? "Edge"}`);

  return {
    browser,
    client,
    userDataDir,
    version: version.Browser ?? "unknown",
    cleanup() {
      client.close();
      killTree(browser);
      if (!opts.keep) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            rmSync(userDataDir, { recursive: true, force: true });
            break;
          } catch {
            /* Edge may still hold a lock; retry shortly */
          }
        }
      }
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Page driver
// ───────────────────────────────────────────────────────────────────────────

class PageDriver {
  constructor(client, opts) {
    this.client = client;
    this.opts = opts;
    this.currentUrl = null;
    this.currentMedia = null;
    this.currentViewport = null;
    this.consoleEvents = [];
    this.shots = [];
    this.structuralFailures = [];
    this.warnings = [];

    client.on("Runtime.consoleAPICalled", (params) => {
      const type = params.type ?? "log";
      const text = (params.args ?? [])
        .map((arg) => {
          if (arg.value !== undefined) return String(arg.value);
          if (arg.unserializableValue !== undefined) return String(arg.unserializableValue);
          return arg.description ?? arg.type ?? "?";
        })
        .join(" ")
        .slice(0, 800);
      this.consoleEvents.push({ kind: "console", level: type, text });
    });
    client.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails ?? {};
      const description =
        details.exception?.description ?? details.text ?? "uncaught exception";
      this.consoleEvents.push({
        kind: "exception",
        level: "error",
        text: String(description).slice(0, 1500),
        url: details.url,
        line: details.lineNumber,
      });
    });
    client.on("Log.entryAdded", (params) => {
      const entry = params.entry ?? {};
      if (!entry.level) return;
      this.consoleEvents.push({
        kind: "log",
        level: entry.level,
        text: String(entry.text ?? "").slice(0, 800),
        url: entry.url,
        line: entry.lineNumber,
      });
    });
  }

  async init() {
    await this.client.send("Page.enable");
    await this.client.send("Runtime.enable");
    await this.client.send("Log.enable");
    await this.setViewport(VIEWPORT);
    await this.setMedia("light");
  }

  async setViewport(viewport) {
    if (
      this.currentViewport &&
      this.currentViewport.width === viewport.width &&
      this.currentViewport.height === viewport.height
    ) {
      return;
    }
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      mobile: false,
    });
    this.currentViewport = viewport;
  }

  /**
   * Wait until the next two animation frames have been painted. Theme changes
   * (class flap + CSS custom-property resolution) land one frame later than the
   * JS class toggle, so capturing any earlier can produce a stale palette.
   */
  async awaitPaint() {
    await this.evaluate(`() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)));
    })`);
    await this.evaluate(`async () => { await document.fonts.ready; return true; }`);
  }

  /** Current paint-level theme facts (class + resolved canvas colour). */
  async readTheme() {
    return this.evaluate(`() => {
      const root = document.documentElement;
      const demo = window.__znDemo;
      const state = demo ? demo.getState() : null;
      return {
        darkClass: root.classList.contains("dark"),
        resolvedMode: state ? state.resolvedMode : null,
        htmlBg: getComputedStyle(root).backgroundColor,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        activeTag: document.activeElement ? document.activeElement.tagName : null,
        activeValue:
          document.activeElement && typeof document.activeElement.value === "string"
            ? document.activeElement.value
            : null,
      };
    }`);
  }

  resetConsole() {
    this.consoleEvents = [];
  }

  takeConsole() {
    const errors = [];
    const warnings = [];
    const seen = new Set();
    for (const event of this.consoleEvents) {
      const key = event.level + "|" + event.text;
      if (seen.has(key)) continue;
      seen.add(key);
      if (event.level === "error" || event.level === "assert") errors.push(event);
      else if (event.level === "warning") warnings.push(event);
    }
    return { errors, warnings };
  }

  async setMedia(media) {
    if (this.currentMedia === media) return;
    await this.client.send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-color-scheme", value: media }],
    });
    this.currentMedia = media;
  }

  /**
   * Evaluate `expression` in the page. Callers pass function sources
   * (`() => ...`); they are invoked here so awaits/returns work naturally.
   */
  async evaluate(expression, timeoutMs = 20000) {
    const source = `(${expression})()`;
    const result = await this.client.send(
      "Runtime.evaluate",
      {
        expression: source,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      },
      timeoutMs,
    );
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "evaluate failed";
      throw new Error(String(description).split("\n")[0]);
    }
    return result.result?.value;
  }

  async waitFor(label, expression, timeoutMs = this.opts.timeout) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression, 8000);
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await sleep(120);
    }
    throw new Error(
      `timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`,
    );
  }

  async waitForOptional(label, expression, timeoutMs = 8000) {
    try {
      return await this.waitFor(label, expression, timeoutMs);
    } catch {
      this.warnings.push(`optional wait missed: ${label}`);
      return false;
    }
  }

  async navigate(url) {
    log(`navigate ${url}`);
    const previousUrl = this.currentUrl;
    await this.client.send("Page.navigate", { url }, 15000);
    this.currentUrl = url;
    // Wait for the NEW document, not just `readyState === 'complete'`: right
    // after Page.navigate that flag still describes the outgoing page, which is
    // how a screenshot could be taken mid-boot (blank frame).
    await this.waitFor(
      `document ready (${url})`,
      `() => location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`,
      30000,
    );
    if (previousUrl === null) {
      // about:blank → app origin: give the module graph a beat to evaluate.
      await sleep(100);
    }
  }

  async clearStorage() {
    try {
      await this.evaluate(
        "() => { try { localStorage.clear(); sessionStorage.clear(); return true; } catch { return false; } }",
      );
    } catch {
      /* about:blank or transient navigation: nothing to clear */
    }
  }

  async screenshot(file) {
    const result = await this.client.send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      20000,
    );
    const buffer = Buffer.from(result.data, "base64");
    writeFileSync(join(ARTIFACTS, file), buffer);
    return buffer;
  }

  async typeText(text) {
    await this.client.send("Input.insertText", { text });
  }

  /** Real (trusted) key chord through CDP, so app shortcuts see genuine events. */
  async pressKey(key, { code, vk = 0, modifiers = 0 } = {}) {
    const base = {
      key,
      code: code ?? key,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    };
    await this.client.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await this.client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(80);
  }

  async mouseClickAt(x, y, button = "left") {
    await this.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      clickCount: 1,
    });
    await this.client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      clickCount: 1,
    });
    await sleep(120);
  }

  /** Centre point of the first element matching `selector`, or null. */
  async centerOf(selector) {
    return this.evaluate(`() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }`);
  }

  async clickSelector(selector, button = "left") {
    const point = await this.centerOf(selector);
    if (!point) return false;
    await this.mouseClickAt(point.x, point.y, button);
    // Right-click additionally gets a synthetic contextmenu event: some widget
    // menus listen for it and CDP's right click does not always synthesise it.
    if (button === "right") {
      await this.evaluate(`() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
          button: 2,
        }));
        return true;
      }`);
    }
    return true;
  }

  /** Find bar state (count, inputs, match counter, replace row). */
  async findBarState() {
    return this.evaluate(`() => {
      const bars = Array.from(document.querySelectorAll('.zn-findbar'));
      const bar = bars.find(el => el.offsetParent !== null) || bars[0] || null;
      const inputs = bar ? Array.from(bar.querySelectorAll('input')) : [];
      const text = bar ? (bar.innerText || '') : '';
      const match = text.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
      return {
        barCount: bars.length,
        visible: !!bar,
        inputValues: inputs.map(input => input.value),
        hasReplaceRow: !!bar && !!bar.querySelector('.zn-findbar__row--replace'),
        countLabel: bar ? (bar.querySelector('.zn-findbar__count')?.textContent || '') : '',
        current: match ? Number(match[1]) : 0,
        total: match ? Number(match[2]) : 0,
      };
    }`);
  }

  /** Computed backgrounds of dark-mode chrome (to catch white panels). */
  async surfaceBackgrounds() {
    return this.evaluate(`() => {
      const selectors = ['[role="dialog"]', '.zn-modal', '.zn-findbar', '.zn-search', '.zn-quickopen', '.zn-shortcuts', '.zn-overlay > *'];
      const seen = new Set();
      const out = [];
      const lum = (bg) => {
        const m = bg.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const parts = m[1].split(',').map(v => Number(v.trim()));
        if (parts.length < 3) return null;
        const alpha = parts.length > 3 ? parts[3] : 1;
        return { r: parts[0], g: parts[1], b: parts[2], alpha,
          luminance: 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2] };
      };
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (el.offsetParent === null) continue;
          const style = getComputedStyle(el);
          const parsed = lum(style.backgroundColor);
          if (!parsed || parsed.alpha < 0.5) continue;
          const key = selector + '|' + el.className;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            selector,
            className: String(el.className || '').slice(0, 80),
            background: style.backgroundColor,
            luminance: Math.round(parsed.luminance),
          });
        }
      }
      return out;
    }`);
  }

  async focusFirstInput() {
    const focused = await this.evaluate(`() => {
      const elements = Array.from(document.querySelectorAll('input, textarea'))
        .filter(el => el.offsetParent !== null && !el.disabled);
      if (!elements.length) return false;
      elements[0].focus();
      return document.activeElement === elements[0];
    }`);
    return !!focused;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Readiness probes
// ───────────────────────────────────────────────────────────────────────────

const DEMO_READY = `() => {
  const demo = window.__znDemo;
  if (!demo || !demo.seeded) return false;
  const state = demo.getState();
  if (state.rootChildren === 0) return false;
  return state.contentLength > 0 ? state.editorCount > 0 : state.emptyState === true;
}`;
const WELCOME_READY = `() => {
  const root = document.getElementById('root');
  if (!root || root.children.length === 0) return false;
  return (document.body.innerText || '').trim().length > 10;
}`;
const OVERLAY_READY = `() => !!document.querySelector('[role="dialog"], .zn-overlay, .zn-modal')`;

// ───────────────────────────────────────────────────────────────────────────
// Screenshot plan
// ───────────────────────────────────────────────────────────────────────────

function buildShots() {
  const demoLight = "/?demo=1&mode=light";
  const demoDark = "/?demo=1&mode=dark";
  const demoLightEn = "/?demo=1&mode=light&lang=en-US";

  const close = async (page) => {
    await page.evaluate("() => window.__znDemo.closePanels()");
    await page.waitForOptional(
      "overlays closed",
      "() => !document.querySelector('[role=\"dialog\"], .zn-overlay, .zn-modal')",
      4000,
    );
    await sleep(150);
  };

  /** Click a settings section by its visible label (zh or en). */
  const openSettingsPane = async (page, label) => {
    const clicked = await page.evaluate(`() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const nodes = Array.from(dialog.querySelectorAll('button, [role="tab"], a, li, div'));
      const exact = nodes.find(el => (el.textContent || '').trim() === ${JSON.stringify(label)});
      const target = exact || nodes.find(el => (el.textContent || '').trim().startsWith(${JSON.stringify(label)}));
      if (!target) return false;
      target.click();
      return true;
    }`);
    if (!clicked) page.warnings.push(`settings section "${label}" not found`);
    await sleep(350);
    return clicked;
  };

  return [
    {
      id: "01",
      file: "01-welcome-light.png",
      label: "Welcome screen — light",
      url: "/",
      media: "light",
      theme: "light",
      wait: "welcome",
      settle: 700,
      minInk: 0.0015,
      checks: (state) => [
        state.welcome?.rootChildren > 0,
        state.welcome?.textLength > 10,
      ],
    },
    {
      id: "02",
      file: "02-welcome-dark.png",
      label: "Welcome screen — dark",
      url: "/",
      media: "dark",
      theme: "dark",
      wait: "welcome",
      settle: 700,
      minInk: 0.0015,
      checks: (state) => [state.darkClass === true],
    },
    {
      id: "03",
      file: "03-workspace-light.png",
      label: "Workspace + editor — light",
      url: demoLight,
      media: "light",
      theme: "light",
      wait: "demo",
      settle: 1600,
      checks: (state) => [
        state.demo?.tabCount === 3,
        state.demo?.editorCount > 0,
        state.demo?.contentLength > 3000,
        state.demo?.dirtyTabs.length === 1,
        state.darkClass === false,
      ],
    },
    {
      id: "04",
      file: "04-workspace-dark.png",
      label: "Workspace + editor — dark",
      url: demoDark,
      media: "light",
      theme: "dark",
      wait: "demo",
      settle: 1600,
      checks: (state) => [
        state.demo?.tabCount === 3,
        state.darkClass === true,
        state.demo?.resolvedMode === "dark",
      ],
    },
    {
      id: "05",
      file: "05-settings.png",
      label: "Settings dialog — light",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('settings')");
        await page.waitForOptional("settings dialog", OVERLAY_READY, 12000);
      },
      checks: (state) => [state.demo?.settingsVisible === true, state.layout.overlayCount > 0],
    },
    {
      id: "06",
      file: "06-search.png",
      label: "Global search overlay — light",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 1600,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('search')");
        await page.waitForOptional("search overlay", OVERLAY_READY, 12000);
        await sleep(400);
        await page.focusFirstInput();
        await page.typeText("canvas");
        await page.waitForOptional(
          "search results",
          "() => document.querySelectorAll('[data-search-item]').length > 0",
          6000,
        );
      },
      checks: (state) => [state.demo?.searchVisible === true, state.layout.overlayCount > 0],
    },
    {
      id: "07",
      file: "07-quickopen.png",
      label: "Quick open overlay — light",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('quickopen')");
        await page.waitForOptional("quick open overlay", OVERLAY_READY, 12000);
        await sleep(300);
        await page.focusFirstInput();
        await page.typeText("proj");
      },
      checks: (state) => [state.layout.overlayCount > 0],
    },
    {
      id: "08",
      file: "08-findbar.png",
      label: "Find bar in the editor — light",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 1400,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('find')");
        await page.waitForOptional(
          "find bar input",
          "() => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }",
          6000,
        );
        await sleep(250);
        await page.focusFirstInput();
        await page.typeText("clay");
      },
      checks: (state) => [
        state.layout.activeElement === "INPUT",
        state.layout.activeValue === "clay",
        state.findBarCount === 1,
        state.findBarVisible === true,
      ],
    },
    {
      id: "09",
      file: "09-shortcuts.png",
      label: "Shortcuts panel — light",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await page.evaluate("() => window.__znDemo.openPanel('shortcuts')");
        await page.waitForOptional("shortcuts dialog", OVERLAY_READY, 12000);
      },
      checks: (state) => [state.layout.overlayCount > 0],
    },
    {
      id: "10",
      file: "10-editor-table.png",
      label: "Editor scrolled to table + code blocks",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 700,
      action: async (page) => {
        await close(page);
        const scrolled = await page.evaluate(
          "() => window.__znDemo.scrollToText('Delivery timeline')",
        );
        if (!scrolled) page.warnings.push("could not scroll to the timeline table");
        await page.waitForOptional(
          "table rendered",
          "() => document.querySelectorAll('.cm-zn-table, .cm-zn-table-wrap').length > 0",
          6000,
        );
        await sleep(400);
      },
      checks: (state) => [state.tableCount > 0],
    },
    {
      id: "11",
      file: "11-editor-mermaid.png",
      label: "Editor scrolled to the mermaid diagram",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        const scrolled = await page.evaluate(
          "() => window.__znDemo.scrollToText('Render pipeline')",
        );
        if (!scrolled) page.warnings.push("could not scroll to the mermaid diagram");
        await page.waitForOptional(
          "mermaid svg",
          "() => document.querySelectorAll('.cm-zn-mermaid svg').length > 0",
          20000,
        );
        await sleep(300);
      },
      checks: (state) => [state.mermaidSvg === true],
    },
    {
      id: "12",
      file: "12-workspace-en.png",
      label: "Workspace in English (long-text overflow check)",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await page.evaluate("() => window.__znDemo.setLocale('en-US')");
        await page.evaluate(`() => {
          const scroller = document.querySelector('.zn-live-preview .cm-scroller, .cm-scroller');
          if (scroller) scroller.scrollTop = 0;
          return true;
        }`);
        await sleep(600);
      },
      checks: (state) => [state.demo?.locale === "en-US"],
    },
    // ── dark-mode overlay coverage ────────────────────────────────────────
    {
      id: "13",
      file: "13-settings-dark.png",
      label: "Settings dialog — dark",
      url: demoDark,
      theme: "dark",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('settings')");
        await page.waitForOptional("settings dialog", OVERLAY_READY, 12000);
      },
      checks: (state) => [state.demo?.settingsVisible === true, state.layout.overlayCount > 0],
    },
    {
      id: "14",
      file: "14-search-dark.png",
      label: "Global search overlay — dark",
      url: demoDark,
      theme: "dark",
      wait: "demo",
      fresh: true,
      settle: 1600,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('search')");
        await page.waitForOptional("search overlay", OVERLAY_READY, 12000);
        await sleep(400);
        await page.focusFirstInput();
        await page.typeText("canvas");
        await page.waitForOptional(
          "search results",
          "() => document.querySelectorAll('[data-search-item]').length > 0",
          6000,
        );
      },
      checks: (state) => [state.demo?.searchVisible === true, state.layout.overlayCount > 0],
    },
    {
      id: "15",
      file: "15-findbar-dark.png",
      label: "Find bar in the editor — dark",
      url: demoDark,
      theme: "dark",
      wait: "demo",
      fresh: true,
      settle: 1400,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('find')");
        await page.waitForOptional(
          "find bar input",
          "() => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }",
          6000,
        );
        await sleep(250);
        await page.focusFirstInput();
        await page.typeText("clay");
      },
      checks: (state) => [
        state.layout.activeElement === "INPUT",
        state.layout.activeValue === "clay",
        state.findBarCount === 1,
        state.findBarVisible === true,
      ],
    },
    {
      id: "16",
      file: "16-shortcuts-dark.png",
      label: "Shortcuts panel — dark",
      url: demoDark,
      theme: "dark",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await page.evaluate("() => window.__znDemo.openPanel('shortcuts')");
        await page.waitForOptional("shortcuts dialog", OVERLAY_READY, 12000);
      },
      checks: (state) => [state.layout.overlayCount > 0],
    },
    // ── narrower viewport: no horizontal overflow at ~1100px ──────────────
    {
      id: "17",
      file: "17-workspace-narrow.png",
      label: "Workspace at 1100px (overflow check)",
      url: demoLight,
      theme: "light",
      viewport: NARROW_VIEWPORT,
      wait: "demo",
      fresh: true,
      settle: 1200,
      checks: (state) => [
        state.demo?.tabCount === 3,
        state.layout.horizontalOverflow === false,
      ],
    },
    // ── settings in English + one alternate pane ──────────────────────────
    {
      id: "18",
      file: "18-settings-en.png",
      label: "Settings dialog — English",
      url: demoLightEn,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('settings')");
        await page.waitForOptional("settings dialog", OVERLAY_READY, 12000);
        await sleep(300);
      },
      checks: (state) => [state.demo?.locale === "en-US", state.layout.overlayCount > 0],
    },
    {
      id: "19",
      file: "19-settings-appearance.png",
      label: "Settings → appearance pane (zh)",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.openPanel('settings')");
        await page.waitForOptional("settings dialog", OVERLAY_READY, 12000);
        await openSettingsPane(page, "外观");
      },
      checks: (state) => [state.layout.overlayCount > 0],
    },
    // ── interactive editor widgets + remaining surfaces ───────────────────
    {
      id: "20",
      file: "20-recent-workspaces.png",
      label: "Sidebar recent-workspaces dropdown",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 700,
      action: async (page) => {
        await close(page);
        await page.clickSelector(".zn-panel-head__title");
        await page.waitForOptional(
          "recent list",
          "() => document.querySelectorAll('.zn-recent-menu__item').length > 0",
          5000,
        );
      },
      checks: (state) => [state.recentMenuItems >= 2],
    },
    {
      id: "21",
      file: "21-editor-code.png",
      label: "Editor — fenced code blocks (ts + js)",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      action: async (page) => {
        await close(page);
        const scrolled = await page.evaluate(
          "() => window.__znDemo.scrollToText('Boot sequence')",
        );
        if (!scrolled) page.warnings.push("could not scroll to the code blocks");
        await page.waitForOptional(
          "code chrome",
          "() => document.querySelectorAll('.cm-zn-code-tools').length > 0",
          6000,
        );
        await sleep(300);
      },
      checks: (state) => [state.codeLangMenu === false],
    },
    {
      id: "22",
      file: "22-code-lang-menu.png",
      label: "Editor — code language menu",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.scrollToText('Boot sequence')");
        await page.waitForOptional(
          "code lang trigger",
          "() => document.querySelectorAll('.zn-lp-code-lang').length > 0",
          6000,
        );
        await page.clickSelector(".zn-lp-code-lang");
        await page.waitForOptional(
          "code lang menu",
          "() => !!document.querySelector('.zn-lp-code-menu')",
          5000,
        );
      },
      checks: (state) => [state.codeLangMenu === true],
    },
    {
      id: "23",
      file: "23-editor-tasklist.png",
      label: "Editor — task list checkboxes",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.scrollToText('Seed a realistic workspace')");
        await sleep(400);
      },
      checks: (state) => [state.taskCount >= 2],
    },
    {
      id: "24",
      file: "24-table-menu.png",
      label: "Editor — table context menu",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.scrollToText('Delivery timeline')");
        await page.waitForOptional(
          "table rendered",
          "() => document.querySelectorAll('.cm-zn-table-wrap').length > 0",
          6000,
        );
        // The row/column menu behind the frame's own button is the reliable
        // entry point; the context-menu variant only arms inside a painted cell
        // range, which is a drag gesture, not a click.
        await page.evaluate(
          "() => document.querySelector('.cm-zn-table-wrap')?.scrollIntoView({ block: 'center' })",
        );
        await sleep(250);
        await page.clickSelector(".cm-zn-table-ops");
        await page.waitForOptional(
          "table menu",
          "() => !!document.querySelector('.zn-lp-table-menu')",
          5000,
        );
      },
      checks: (state) => [state.tableMenu === true],
    },
    {
      id: "25",
      file: "25-image-bar.png",
      label: "Editor — image alignment bar",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.scrollToText('Surface samples')");
        await page.waitForOptional(
          "image rendered",
          "() => document.querySelectorAll('.cm-zn-image img').length > 0",
          6000,
        );
        await page.evaluate(
          "() => document.querySelector('.cm-zn-image')?.scrollIntoView({ block: 'center' })",
        );
        await sleep(250);
        await page.clickSelector(".cm-zn-image img");
        await page.waitForOptional(
          "image bar",
          "() => !!document.querySelector('.zn-lp-image-bar')",
          5000,
        );
      },
      checks: (state) => [state.imageBar === true],
    },
    {
      id: "26",
      file: "26-source-mode.png",
      label: "Source mode (Ctrl+`)",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 900,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => document.querySelector('.cm-content')?.focus()");
        await page.pressKey("`", { code: "Backquote", vk: 192, modifiers: 2 });
        await page.waitForOptional(
          "source mode active",
          "() => !!window.__znDemo && window.__znDemo.getState().sourceMode === true",
          6000,
        );
        await page.waitForOptional(
          "source gutters",
          "() => document.querySelectorAll('.cm-lineNumbers').length > 0",
          6000,
        );
        await sleep(300);
      },
      checks: (state) => [state.demo?.sourceMode === true, state.sourceGutters === true],
    },
    {
      id: "27",
      file: "27-empty-state.png",
      label: "Editor empty state after closing the last tab",
      url: demoLight,
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 700,
      action: async (page) => {
        await close(page);
        await page.evaluate("() => window.__znDemo.clearDocument()");
        await page.waitForOptional(
          "empty state",
          "() => !!document.querySelector('.zn-editor-empty')",
          5000,
        );
      },
      checks: (state) => [state.emptyState === true],
    },
    {
      id: "28",
      file: "28-empty-state-cold.png",
      label: "Editor empty state — cold start (workspace, no note)",
      url: "/?demo=1&mode=light&empty=1",
      theme: "light",
      wait: "demo",
      fresh: true,
      settle: 800,
      checks: (state) => [
        state.emptyState === true,
        state.demo?.tabCount === 0,
        state.statusbarText.includes("Ln ") === false,
      ],
    },
  ];
}

// ───────────────────────────────────────────────────────────────────────────
// Layout / structural probes
// ───────────────────────────────────────────────────────────────────────────

const PROBE = `() => {
  const demoApi = window.__znDemo;
  const demo = demoApi ? demoApi.getState() : null;
  const root = document.getElementById('root');
  const bodyText = (document.body.innerText || '').trim();
  const de = document.documentElement;
  return {
    demo,
    darkClass: de.classList.contains('dark'),
    htmlBg: getComputedStyle(de).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    welcome: { rootChildren: root ? root.children.length : 0, textLength: bodyText.length },
    mermaidSvg: document.querySelectorAll(".cm-zn-mermaid svg").length > 0,
    katexCount: document.querySelectorAll(".katex").length,
    tableCount: document.querySelectorAll(".cm-zn-table, .cm-zn-table-wrap").length,
    taskCount: document.querySelectorAll(".cm-zn-task").length,
    tocTitle: document.querySelector(".cm-zn-toc-title")?.textContent ?? null,
    findBarCount: document.querySelectorAll(".zn-findbar").length,
    findBarVisible: Array.from(document.querySelectorAll(".zn-findbar")).some(el => el.offsetParent !== null),
    codeLangMenu: !!document.querySelector(".zn-lp-code-menu"),
    tableMenu: !!document.querySelector(".zn-lp-table-menu"),
    imageBar: !!document.querySelector(".zn-lp-image-bar"),
    recentMenuItems: document.querySelectorAll(".zn-recent-menu__item").length,
    statusbarText: document.querySelector(".zn-statusbar")?.innerText ?? "",
    sourceGutters: document.querySelectorAll(".cm-lineNumbers").length > 0,
    emptyState: !!document.querySelector(".zn-editor-empty"),
    layout: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalOverflow: de.scrollWidth > window.innerWidth + 1,
      verticalOverflow: de.scrollHeight > window.innerHeight + 1,
      activeElement: document.activeElement ? document.activeElement.tagName : null,
      activeValue:
        document.activeElement && typeof document.activeElement.value === 'string'
          ? document.activeElement.value
          : null,
      overlayCount: document.querySelectorAll('[role="dialog"], .zn-overlay, .zn-modal').length,
    },
  };
}`;

// ───────────────────────────────────────────────────────────────────────────
// Integration checks (real key chords / clicks, not just screenshots)
// ───────────────────────────────────────────────────────────────────────────

async function runIntegrationChecks(driver, failures, results) {
  const check = (id, label, ok, details) => {
    const entry = { id, label, ok: !!ok, details: details ?? null };
    results.push(entry);
    log(`   [integration] ${ok ? "PASS" : "FAIL"}  ${id}  ${label}`);
    if (!ok) {
      failures.push({
        shot: "-",
        kind: "integration",
        text: `${id} ${label}: ${JSON.stringify(details ?? {}).slice(0, 400)}`,
      });
    }
    return !!ok;
  };
  const wait = (label, expression, timeout = 8000) => driver.waitFor(label, expression, timeout);
  const focusEditor = () =>
    driver.evaluate("() => { const el = document.querySelector('.cm-content'); if (el) el.focus(); return !!el; }");
  const escape = () => driver.pressKey("Escape", { code: "Escape", vk: 27 });
  const goDemo = async (mode, key) => {
    await driver.setViewport(VIEWPORT);
    await driver.clearStorage();
    await driver.navigate(`${BASE_URL}/?demo=1&mode=${mode}&check=${key}`);
    await driver.waitFor("demo workspace ready", DEMO_READY, 25000);
    await driver.awaitPaint();
  };

  // (a) Ctrl+F opens exactly one bar, and find works on BOTH editing surfaces.
  await goDemo("light", "a");
  await focusEditor();
  await driver.pressKey("f", { code: "KeyF", vk: 70, modifiers: 2 });
  await sleep(350);
  let find = await driver.findBarState();
  check("a1", "Ctrl+F opens exactly one find bar (live preview)", find.barCount === 1 && find.visible, find);

  await driver.typeText("canvas");
  await sleep(750);
  find = await driver.findBarState();
  check("a2", "find in live preview reports matches", find.total > 0 && find.current >= 1, find);

  await driver.pressKey("`", { code: "Backquote", vk: 192, modifiers: 2 });
  await wait("source mode on", "() => window.__znDemo.getState().sourceMode === true", 8000);
  await sleep(400);
  await escape();
  await sleep(250);
  await focusEditor();
  await driver.pressKey("f", { code: "KeyF", vk: 70, modifiers: 2 });
  await sleep(400);
  find = await driver.findBarState();
  check("a3", "Ctrl+F opens exactly one find bar (source mode)", find.barCount === 1 && find.visible, find);

  await driver.typeText("ThemeMode");
  await sleep(750);
  find = await driver.findBarState();
  check("a4", "find in source mode reports matches", find.total > 0, find);
  await escape();
  await sleep(200);
  await driver.pressKey("`", { code: "Backquote", vk: 192, modifiers: 2 });
  await wait("source mode off", "() => window.__znDemo.getState().sourceMode === false", 8000);

  // (b) Ctrl+H opens the replace row.
  await goDemo("light", "b");
  await focusEditor();
  await driver.pressKey("h", { code: "KeyH", vk: 72, modifiers: 2 });
  await sleep(400);
  find = await driver.findBarState();
  check(
    "b1",
    "Ctrl+H opens one find bar with the replace row",
    find.barCount === 1 && find.visible && find.hasReplaceRow,
    find,
  );
  await escape();

  // (c) global search -> jump to the hit: find bar pre-filled + caret on line.
  await goDemo("light", "c");
  await driver.pressKey("F", { code: "KeyF", vk: 70, modifiers: 10 });
  await wait("search overlay", "() => !!document.querySelector('.zn-search')", 8000);
  await sleep(350);
  await driver.typeText("canvas");
  await wait("search results", "() => document.querySelectorAll('.zn-search-result').length > 0", 8000);
  await sleep(250);
  const resultInfo = await driver.evaluate(`() => {
    const first = document.querySelector('.zn-search-result');
    const lineText = first?.querySelector('.zn-search-result__line')?.textContent ?? '';
    const match = new RegExp(':([0-9]+)').exec(lineText);
    return {
      line: match ? Number(match[1]) : null,
      count: document.querySelectorAll('.zn-search-result').length,
      label: (first?.innerText || '').slice(0, 120),
    };
  }`);
  await driver.pressKey("Enter", { code: "Enter", vk: 13 });
  await sleep(900);
  let jump = null;
  try {
    await wait("find bar after search jump", "() => !!document.querySelector('.zn-findbar')", 6000);
    jump = await driver.evaluate(`() => {
      const demo = window.__znDemo.getState();
      const bars = Array.from(document.querySelectorAll('.zn-findbar'));
      const bar = bars.find(el => el.offsetParent !== null) || bars[0] || null;
      const inputs = bar ? Array.from(bar.querySelectorAll('input')) : [];
      const text = bar ? (bar.innerText || '') : '';
      const match = new RegExp('([0-9]+)[ ]*/[ ]*([0-9]+)').exec(text);
      return {
        value: inputs[0]?.value ?? null,
        barCount: bars.length,
        current: match ? Number(match[1]) : 0,
        total: match ? Number(match[2]) : 0,
        cursorLine: demo.cursorLine,
        sourceMode: demo.sourceMode,
      };
    }`);
  } catch {
    /* reported by the failing checks below */
  }
  check("c1", "search jump pre-fills the find bar with the query", !!jump && jump.value === "canvas", {
    jump,
    resultInfo,
  });
  check(
    "c2",
    "search jump puts the caret on the matched line",
    !!jump && resultInfo.line !== null && jump.cursorLine === resultInfo.line,
    { resultLine: resultInfo.line, cursorLine: jump?.cursorLine },
  );
  check("c3", "find bar shows a match counter after the jump", !!jump && jump.total > 0 && jump.barCount === 1, jump);
  await escape();

  // (d) sidebar default on a clean launch + recent-workspaces dropdown.
  await goDemo("light", "d");
  const launch = await driver.evaluate(`() => {
    let session = null;
    try { session = localStorage.getItem('zennote:session'); } catch { session = 'blocked'; }
    const demo = window.__znDemo.getState();
    return { sidebarVisible: demo.sidebarVisible, outlineVisible: demo.outlineVisible, sessionPresent: session !== null };
  }`);
  check(
    "d1",
    "sidebar visible on a clean launch (no persisted session)",
    launch.sidebarVisible === true && launch.sessionPresent === false,
    launch,
  );
  await driver.clickSelector(".zn-panel-head__title");
  await wait("recent workspaces menu", "() => document.querySelectorAll('.zn-recent-menu__item').length > 0", 5000);
  const recent = await driver.evaluate(`() => ({
    count: document.querySelectorAll('.zn-recent-menu__item').length,
    names: Array.from(document.querySelectorAll('.zn-recent-menu__name')).map(el => el.textContent),
  })`);
  check(
    "d2",
    "recent-workspaces dropdown lists entries after opening a workspace",
    recent.count >= 2,
    recent,
  );
  await escape();

  // (e) dark chrome: canvas + every open surface stays dark.
  await goDemo("dark", "e");
  const canvas = await driver.evaluate("() => getComputedStyle(document.documentElement).backgroundColor");
  const surfaces = {};
  await driver.evaluate("() => window.__znDemo.openPanel('settings')");
  await wait("settings dialog", OVERLAY_READY, 8000);
  await sleep(300);
  surfaces.settings = await driver.surfaceBackgrounds();
  await escape();
  await sleep(250);
  await driver.pressKey("F", { code: "KeyF", vk: 70, modifiers: 10 });
  await wait("dark search overlay", "() => !!document.querySelector('.zn-search')", 8000);
  await sleep(300);
  surfaces.search = await driver.surfaceBackgrounds();
  await escape();
  await sleep(250);
  await focusEditor();
  await driver.pressKey("f", { code: "KeyF", vk: 70, modifiers: 2 });
  await sleep(400);
  surfaces.find = await driver.surfaceBackgrounds();
  await escape();
  await sleep(250);
  await driver.pressKey("F1", { code: "F1", vk: 112 });
  await wait("shortcuts dialog", OVERLAY_READY, 8000);
  await sleep(300);
  surfaces.shortcuts = await driver.surfaceBackgrounds();
  await escape();
  const allSurfaces = Object.values(surfaces).flat();
  const lightSurfaces = allSurfaces.filter((surface) => surface.luminance > 150);
  check(
    "e1",
    "dark chrome uses dark tokens (canvas rgb(38,38,36), no white panel)",
    canvas === "rgb(38, 38, 36)" && lightSurfaces.length === 0,
    { canvas, lightSurfaces, surfaceCount: allSurfaces.length, surfaces },
  );

  // (f) runtime locale switch rebuilds editor widgets (TOC label).
  await goDemo("light", "f");
  await wait("toc title", "() => !!document.querySelector('.cm-zn-toc-title')", 8000);
  const zhTitle = await driver.evaluate(
    "() => document.querySelector('.cm-zn-toc-title')?.textContent ?? null",
  );
  await driver.evaluate("() => window.__znDemo.setLocale('en-US')");
  let enTitle = null;
  try {
    enTitle = await driver.waitFor(
      "toc title translated",
      `() => {
        const el = document.querySelector('.cm-zn-toc-title');
        return el && el.textContent && el.textContent !== '目录' ? el.textContent : false;
      }`,
      6000,
    );
  } catch {
    /* reported below */
  }
  check(
    "f1",
    "TOC title follows a runtime zh→en switch",
    zhTitle === "目录" && enTitle === "Table of Contents",
    { zhTitle, enTitle },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACTS, { recursive: true });
  const shots = buildShots().filter(
    (shot) => !opts.only || opts.only.some((prefix) => shot.id.startsWith(prefix)),
  );
  if (shots.length === 0) {
    throw new Error(`--only did not match any shot (${opts.only?.join(", ")})`);
  }

  const failures = [];
  const results = [];
  const integrationResults = [];
  let server = { child: null, startedByUs: false };
  let browser = null;
  let driver = null;

  try {
    if (!opts.noServer) server = await startDevServer();
    else {
      await waitForHttp(BASE_URL, 5000);
      log(`--no-server: using ${BASE_URL}`);
    }

    browser = await launchBrowser(opts);
    driver = new PageDriver(browser.client, opts);
    await driver.init();

    for (const shot of shots) {
      const shotStarted = Date.now();
      driver.resetConsole();
      log(`── ${shot.id}  ${shot.label}`);

      if (shot.media && shot.media !== driver.currentMedia) {
        await driver.setMedia(shot.media);
      }
      await driver.setViewport(shot.viewport ?? VIEWPORT);
      // Every shot starts from a freshly loaded page unless it explicitly
      // continues the previous one; that keeps panel state from leaking
      // between screenshots and mirrors a cold app start.
      const targetUrl = shot.url
        ? BASE_URL + shot.url + (shot.fresh ? `${shot.url.includes("?") ? "&" : "?"}shot=${shot.id}` : "")
        : null;
      if (targetUrl && targetUrl !== driver.currentUrl) {
        await driver.clearStorage();
        await driver.navigate(targetUrl);
      }

      if (shot.wait === "demo") {
        await driver.waitFor("demo workspace ready", DEMO_READY, 25000);
        await driver.waitForOptional(
          "fonts settled",
          `async () => { await document.fonts.ready; return true; }`,
          6000,
        );
      } else if (shot.wait === "welcome") {
        await driver.waitFor("welcome screen ready", WELCOME_READY, 25000);
        await driver.waitForOptional(
          "fonts settled",
          `async () => { await document.fonts.ready; return true; }`,
          6000,
        );
      }

      if (shot.action) await shot.action(driver);

      if ((shot.settle ?? 400) > 0) await sleep(shot.settle ?? 400);

      // Theme verification: the class toggle is synchronous but the palette is
      // resolved on the next paint, so wait two frames and then assert both the
      // class and the computed canvas colour before capturing.
      let themeFacts = null;
      if (shot.theme) {
        await driver.awaitPaint();
        themeFacts = await driver.readTheme();
        const expected = THEME_BACKGROUND[shot.theme];
        const rgb = (themeFacts.htmlBg.match(/\d+/g) ?? []).slice(0, 3).map(Number);
        const backgroundOk =
          rgb.length === 3 && rgb.every((value, index) => Math.abs(value - expected[index]) <= 4);
        if (themeFacts.darkClass !== (shot.theme === "dark")) {
          failures.push({
            shot: shot.id,
            kind: "theme",
            text: `expected .dark=${shot.theme === "dark"}, got ${themeFacts.darkClass}`,
          });
        }
        if (
          themeFacts.resolvedMode !== null &&
          themeFacts.resolvedMode !== shot.theme
        ) {
          failures.push({
            shot: shot.id,
            kind: "theme",
            text: `store resolvedMode=${themeFacts.resolvedMode}, expected ${shot.theme}`,
          });
        }
        if (!backgroundOk) {
          failures.push({
            shot: shot.id,
            kind: "theme",
            text: `canvas background ${themeFacts.htmlBg}, expected rgb(${expected.join(", ")})`,
          });
        }
        log(
          `   theme: ${shot.theme} (dark class=${themeFacts.darkClass}, bg=${themeFacts.htmlBg})`,
        );
        // Dark mode must not leave a white/light chrome panel behind.
        if (shot.theme === "dark") {
          const surfaces = await driver.surfaceBackgrounds();
          const lightSurfaces = surfaces.filter((surface) => surface.luminance > 150);
          themeFacts.surfaces = surfaces;
          if (lightSurfaces.length > 0) {
            failures.push({
              shot: shot.id,
              kind: "theme",
              text: `light surface(s) in dark mode: ${lightSurfaces
                .map((surface) => `${surface.selector} ${surface.className} ${surface.background}`)
                .join("; ")}`,
            });
          }
          log(
            `   dark surfaces: ${surfaces.length ? surfaces.map((surface) => `${surface.selector}=${surface.luminance}`).join(", ") : "none visible"}`,
          );
        }
      }

      const probe = await driver.evaluate(PROBE);
      const { errors, warnings } = driver.takeConsole();
      if (warnings.length) {
        for (const warning of warnings) {
          log(`   warning: ${warning.text.slice(0, 220)}`);
          driver.warnings.push(`${shot.id}: ${warning.text.slice(0, 220)}`);
        }
      }
      if (errors.length) {
        for (const error of errors) {
          log(`   ERROR [${error.kind}/${error.level}] ${error.text.slice(0, 400)}`);
          failures.push({
            shot: shot.id,
            kind: "console",
            text: error.text.slice(0, 800),
            url: error.url,
            line: error.line,
          });
        }
      }
      if (probe.layout?.horizontalOverflow) {
        const message = `horizontal page overflow (${probe.layout.scrollWidth}px at ${probe.layout.innerWidth}px viewport)`;
        log(`   ERROR: ${message}`);
        failures.push({ shot: shot.id, kind: "layout", text: message });
      }
      if (probe.layout?.verticalOverflow) {
        const message = `vertical page overflow (${probe.layout.scrollHeight}px at ${probe.layout.innerHeight}px viewport)`;
        log(`   warning: ${message}`);
        driver.warnings.push(`${shot.id}: ${message}`);
      }
      if (probe.demo && probe.demo.rootChildren === 0) {
        failures.push({ shot: shot.id, kind: "dom", text: "app root is empty" });
      }
      if (shot.checks) {
        const outcomes = shot.checks(probe);
        outcomes.forEach((outcome, index) => {
          if (outcome === false) {
            failures.push({
              shot: shot.id,
              kind: "check",
              text: `structural check #${index + 1} failed for ${shot.file}`,
            });
          }
        });
      }

      const buffer = await driver.screenshot(shot.file);
      const bytes = buffer.length;
      const pixels = analyzePng(buffer);
      const blank =
        pixels?.analyzed === true
          ? pixels.uniqueColors < 4 || pixels.offBackgroundRatio < 0.0005
          : bytes < MIN_PNG_BYTES;
      const minInk =
        shot.minInk ?? (shot.wait === "welcome" ? WELCOME_MIN_INK : DEFAULT_MIN_INK);
      const lowInk =
        pixels?.analyzed === true &&
        pixels.uniqueColors >= 4 &&
        pixels.offBackgroundRatio < minInk;
      if (blank) {
        failures.push({
          shot: shot.id,
          kind: "screenshot",
          text: `${shot.file} looks blank (${bytes} bytes, ${pixels?.analyzed ? `${pixels.uniqueColors} colours / ${(pixels.offBackgroundRatio * 100).toFixed(2)}% ink` : "pixel check unavailable"})`,
        });
      } else if (lowInk) {
        failures.push({
          shot: shot.id,
          kind: "screenshot",
          text: `${shot.file} ink coverage ${(pixels.offBackgroundRatio * 100).toFixed(2)}% is below ${(minInk * 100).toFixed(2)}% — page likely half-painted`,
        });
      } else if (bytes < MIN_PNG_BYTES) {
        driver.warnings.push(
          `${shot.id}: ${shot.file} is small (${bytes} bytes) but not blank (${pixels.uniqueColors} colours)`,
        );
      }
      log(
        `   saved artifacts/${shot.file} (${(bytes / 1024).toFixed(1)} KB, ${pixels?.analyzed ? `${pixels.uniqueColors} colours / ${(pixels.offBackgroundRatio * 100).toFixed(2)}% ink` : "no pixel check"}) in ${Date.now() - shotStarted}ms${blank ? "  <-- BLANK" : ""}${lowInk ? "  <-- LOW INK" : ""}`,
      );
      results.push({
        id: shot.id,
        file: shot.file,
        label: shot.label,
        bytes,
        ms: Date.now() - shotStarted,
        blank,
        lowInk,
        theme: themeFacts
          ? {
              expected: shot.theme,
              darkClass: themeFacts.darkClass,
              resolvedMode: themeFacts.resolvedMode,
              htmlBg: themeFacts.htmlBg,
            }
          : null,
        pixels: pixels?.analyzed
          ? { uniqueColors: pixels.uniqueColors, offBackgroundRatio: pixels.offBackgroundRatio }
          : null,
        layout: probe.layout,
        demo: probe.demo
          ? {
              tabCount: probe.demo.tabCount,
              dirtyTabs: probe.demo.dirtyTabs.length,
              mode: probe.demo.mode,
              resolvedMode: probe.demo.resolvedMode,
              locale: probe.demo.locale,
              contentLength: probe.demo.contentLength,
            }
          : null,
      });
    }

    // ── integration checks (real key chords, not screenshots) ─────────────
    log("── integration checks");
    try {
      await runIntegrationChecks(driver, failures, integrationResults);
    } catch (error) {
      failures.push({
        shot: "-",
        kind: "integration",
        text: `integration checks crashed: ${String(error?.stack ?? error)}`,
      });
      log(`   [integration] CRASH: ${error?.message ?? error}`);
    }
  } catch (error) {
    failures.push({ shot: "-", kind: "fatal", text: String(error?.stack ?? error) });
    log(`FATAL: ${error?.message ?? error}`);
    // Dump whatever the page looked like so a compile/runtime failure is
    // diagnosable from the log alone.
    if (driver) {
      try {
        const diag = await driver.evaluate(`() => ({
          href: location.href,
          readyState: document.readyState,
          rootChildren: document.getElementById('root')?.children.length ?? -1,
          bodyText: (document.body.innerText || '').slice(0, 400),
          viteErrorOverlay: !!document.querySelector('vite-error-overlay'),
          scripts: Array.from(document.scripts).map(s => s.src || '(inline)').slice(0, 6),
        })`);
        log(`diagnostics: ${JSON.stringify(diag)}`);
      } catch (diagnosticError) {
        log(`diagnostics unavailable: ${diagnosticError?.message ?? diagnosticError}`);
      }
      for (const event of driver.consoleEvents.slice(0, 40)) {
        log(`[${event.kind}/${event.level}] ${event.text.slice(0, 700)}`);
      }
    }
  } finally {
    try {
      driver?.resetConsole();
    } catch {
      /* ignore */
    }
    browser?.cleanup();
    if (server.startedByUs) {
      log("stopping dev server");
      killTree(server.child);
    }
    logFlush();
  }

  // ── summary ───────────────────────────────────────────────────────────────
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    browser: browser?.version ?? "unknown",
    node: process.version,
    viewport: VIEWPORT,
    devServerReused: !server.startedByUs,
    screenshots: results,
    integration: integrationResults,
    failures,
    warnings: driver?.warnings ?? [],
  };
  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n──────── summary ────────");
  for (const result of results) {
    console.log(
      `  ${result.id}  ${result.file.padEnd(26)} ${(result.bytes / 1024).toFixed(1).padStart(7)} KB`,
    );
  }
  const integrationPassed = integrationResults.filter((entry) => entry.ok).length;
  console.log(
    `\n  integration: ${integrationPassed}/${integrationResults.length} passed`,
  );
  for (const entry of integrationResults) {
    console.log(`   ${entry.ok ? "PASS" : "FAIL"}  ${entry.id}  ${entry.label}`);
  }
  if (summary.warnings.length) {
    console.log(`\n  ${summary.warnings.length} warning(s):`);
    for (const warning of summary.warnings) console.log(`   - ${warning}`);
  }
  if (failures.length) {
    console.log(`\n  ${failures.length} failure(s):`);
    for (const failure of failures) {
      console.log(`   - [${failure.kind}] ${failure.shot}: ${failure.text.split("\n")[0]}`);
    }
    console.log(`\n  log: ${LOG_FILE}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  PASS — ${results.length} screenshot(s) captured, no page errors.`);
    console.log(`  log: ${LOG_FILE}`);
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error("verify-ui fatal:", error);
  logFlush();
  process.exit(1);
});
