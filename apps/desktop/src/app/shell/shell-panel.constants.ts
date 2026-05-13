export const SHELL_LEFT_PANEL_PX = { default: 200, min: 160, max: 320 } as const;
export const SHELL_RIGHT_PANEL_PX = { default: 220, min: 180, max: 400 } as const;

export function pxToPercent(px: number): number {
  return (px / window.innerWidth) * 100;
}
