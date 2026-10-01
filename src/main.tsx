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

if (!isExportWindow()) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}