// Fixed-width left sidebar. Matches the Settings shell sidebar (w-64
// = 256px) so navigating between app and settings doesn't cause a
// layout jump. No resize handle; collapsed → 0px.
export const SHELL_LEFT_PANEL_PX = 256;
// Phase 4 — wider aside accommodates the Files-tab and the Terminal
// tab. 320 default matches the Phase 4 spec; 720 max gives diffs room
// without horizontal scroll on common viewport widths.
export const SHELL_RIGHT_PANEL_PX = { default: 320, min: 240, max: 720 } as const;

export function pxToPercent(px: number): number {
  return (px / window.innerWidth) * 100;
}
