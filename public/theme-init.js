/*
 * Pre-paint theme resolution.
 *
 * Loaded synchronously from <head> (external because the Tauri CSP forbids
 * inline scripts). Mirrors the logic in src/App.tsx: read the persisted
 * appearance mode, resolve "system" with the OS preference, and put the `dark`
 * class on <html> before the first paint so there is no white flash.
 */
(function () {
  try {
    var raw = window.localStorage.getItem("zennote:session");
    var mode = "system";
    if (raw) {
      var data = JSON.parse(raw);
      if (data && typeof data.mode === "string") mode = data.mode;
    }
    var dark =
      mode === "dark" ||
      (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) {
      document.documentElement.classList.add("dark");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#262624");
    }
  } catch (error) {
    /* private mode / corrupted session: fall through to the light canvas */
  }
})();
