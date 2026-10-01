import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// MUST stay after ./App: App's subtree pulls in @milkdown/crepe's stylesheets,
// and the Crepe overrides in globals.css are written at the same specificity as
// Crepe's own rules, so they only win by being loaded later. Reordering these
// two imports silently disables every editor override.
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