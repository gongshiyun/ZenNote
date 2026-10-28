import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// KaTeX lays its output out entirely in CSS — without this sheet a formula is a
// flat run of text, so `a^2` shows as "a2" and fractions lose their bar. Must stay
// BEFORE globals.css so the app's own rules still win.
import 'katex/dist/katex.min.css';
// MUST stay after ./App: globals.css overrides the editor's own rules at the same
// specificity, so it only wins by being loaded later. Reordering these two imports
// silently disables every editor override.
import './styles/globals.css';

// PDF-export render windows (label "pdf-export-*") must NOT mount the app: they
// are short-lived hidden webviews whose only purpose is to be printed to PDF.
// Mounting would run persistence hooks and could overwrite the real session.
function isExportWindow(): boolean {
  try {
    const w = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__;
    const label = w?.metadata?.currentWindow?.label ?? '';
    return label.startsWith('pdf-export');
  } catch {
    return false;
  }
}

async function mountApp(): Promise<void> {
  // Dev-only demo boot: `npm run dev` + `?demo=1` seeds a fake workspace before
  // the first render, so the full UI can be screenshotted in a plain browser
  // (scripts/verify-ui.mjs). The guard must be the literal `import.meta.env.DEV`
  // inside the branch: Vite replaces it with `false` in production, which lets
  // Rollup drop both the branch and the dynamically imported demo chunk.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      const { seedDemo } = await import('./dev/demo');
      const mode = params.get('mode');
      seedDemo({
        mode: mode === 'light' || mode === 'dark' || mode === 'system' ? mode : undefined,
        locale: params.get('lang') ?? undefined,
        emptyDocument: params.get('empty') === '1',
      });
    }
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (!isExportWindow()) {
  void mountApp();
}
