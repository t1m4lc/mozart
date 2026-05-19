// Resizable panel sizes as percentages of the viewport width. We
// hand these directly to hlm-resizable, which speaks in percentages —
// no runtime conversion needed.
//
// Anchored to a 1440px reference viewport:
//   Left  : 256px ≈ 18 %  (matches the Settings shell sidebar w-64)
//   Right : 320px ≈ 22 %  (Phase-4 Files+Terminal aside)
export const SHELL_LEFT_PANEL_PCT = { default: 18, min: 14, max: 32 } as const;
export const SHELL_RIGHT_PANEL_PCT = { default: 22, min: 17, max: 50 } as const;
