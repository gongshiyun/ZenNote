/**
 * One-time migration of persisted appearance preferences.
 *
 * v2: the Claude theme / Anthropic Sans stack became the product default.
 * Sessions written before that carried themeId "zen" and fontFamily "sans"
 * purely because those were the defaults, not because the user chose them, so
 * they are moved forward once.
 *
 * The version marker is what makes this safe to run on every launch: without
 * it, a user who later picks "zen" on purpose would be bounced back to
 * "claude" every time they reopened the app.
 */
export const APPEARANCE_VERSION = 2;

export interface StoredAppearance {
  themeId?: string;
  fontFamily?: string;
  appearanceVersion?: number;
}

export function migrateAppearance(data: StoredAppearance): {
  themeId?: string;
  fontFamily?: string;
} {
  if ((data.appearanceVersion ?? 1) >= APPEARANCE_VERSION) {
    return { themeId: data.themeId, fontFamily: data.fontFamily };
  }
  return {
    themeId: data.themeId === "zen" ? "claude" : data.themeId,
    fontFamily: data.fontFamily === "sans" ? "claude" : data.fontFamily,
  };
}
