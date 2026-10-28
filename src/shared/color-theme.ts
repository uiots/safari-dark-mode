// Shared color-theme poles and engine knobs for the Dark Reader wrapper.
// These mirror Dark Reader's DEFAULT_COLORS so the self-hosted fork and the
// embedded vendor bundle agree on the same dark/light scheme poles.

export const DARK_SCHEME_BACKGROUND = '#181a1b';
export const DARK_SCHEME_TEXT = '#e8e6e3';
export const LIGHT_SCHEME_BACKGROUND = '#dcdad7';
export const LIGHT_SCHEME_TEXT = '#181a1b';
export const DEFAULT_GRAYSCALE = 10; // soft chroma reduction ≈ keep 0.9 of saturation
export const ENGINE_MODE_DYNAMIC = 1 as const;
