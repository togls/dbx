export const WINDOW_BACKGROUND_OPACITY_MIN = 50;
export const WINDOW_BACKGROUND_OPACITY_MAX = 100;
export const WINDOW_BACKGROUND_OPACITY_DEFAULT = 85;

export function normalizeWindowBackgroundOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return WINDOW_BACKGROUND_OPACITY_DEFAULT;
  return Math.min(WINDOW_BACKGROUND_OPACITY_MAX, Math.max(WINDOW_BACKGROUND_OPACITY_MIN, Math.round(value)));
}
