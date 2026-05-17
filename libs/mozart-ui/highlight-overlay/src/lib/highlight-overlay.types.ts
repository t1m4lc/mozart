// Public types for `<mz-highlight-overlay>`. Consumers pass an array
// of HighlightStep — the primitive owns the punch-hole geometry +
// positioning ; the consumer drives the cursor via `currentIndex`.

export type HighlightSide = 'top' | 'right' | 'bottom' | 'left' | 'auto';

export interface HighlightStep {
  /** CSS selector resolved against `document` on each step transition. */
  readonly targetSelector: string;
  /** Bold title surfaced at the top of the tooltip card. */
  readonly title: string;
  /** Body copy under the title. Plain text — no HTML interpolation. */
  readonly description: string;
  /** Where the tooltip card lands relative to the target. Defaults to
   *  'bottom' ; 'auto' picks the side with the most room. */
  readonly position?: HighlightSide;
}

/** Geometry of the punch-hole + tooltip anchor. Computed each frame
 *  from `targetSelector` + an optional padding for the hole. */
export interface HighlightGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly side: Exclude<HighlightSide, 'auto'>;
}
