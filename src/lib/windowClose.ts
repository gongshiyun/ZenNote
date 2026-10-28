interface CloseEventLike {
  preventDefault: () => void;
}

interface CloseRequestDeps {
  hasDirtyDocuments: () => boolean;
  flushDirtyDocuments: () => Promise<{ ok: boolean }>;
  confirmExit: () => boolean;
  destroy: () => Promise<void>;
  close: () => Promise<void>;
}

export function createCloseRequestHandler(deps: CloseRequestDeps) {
  let allowClose = false;
  let closing = false;

  return async (event: CloseEventLike): Promise<void> => {
    // A second close request arrives while the first flush is still running.
    // It must be prevented too: Tauri destroys the window whenever the handler
    // returns without preventDefault, which would kill the app mid-save.
    if (closing) {
      event.preventDefault();
      return;
    }
    if (allowClose) return;
    if (!deps.hasDirtyDocuments()) return;

    event.preventDefault();
    closing = true;
    try {
      const result = await deps.flushDirtyDocuments();
      if (!result.ok && !deps.confirmExit()) return;

      allowClose = true;
      try {
        await deps.destroy();
      } catch (error) {
        console.warn("window-destroy-failed", error);
        await deps.close();
      }
    } finally {
      closing = false;
    }
  };
}
