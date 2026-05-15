export const SHELL_LEFT_PANEL_PX = { default: 200, min: 160, max: 320 } as const;
// Phase 4 — wider aside accommodates the Files-tab diff panel and the
// Terminal tab. 320 default matches the Phase 4 spec; 720 max gives
// diffs room without horizontal scroll on common viewport widths.
export const SHELL_RIGHT_PANEL_PX = { default: 320, min: 240, max: 720 } as const;

export function pxToPercent(px: number): number {
  return (px / window.innerWidth) * 100;
}
