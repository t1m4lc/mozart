/**
 * `TopBarComponent` — 36 px tall application chrome strip.
 *
 * Left: brand mark "◆ Mozart".
 * Right: disabled `[Settings]` + `[About]` buttons carrying tooltips that
 * name the milestone unblocking them (per DESIGN.md Rule 7).
 *
 * No state, no DI; pure presentational landmark (`role="banner"`).
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmTooltipImports],
  template: `
    <header role="banner" class="bar">
      <span class="brand" aria-label="Mozart">
        <span class="diamond" aria-hidden="true">&#9670;</span>
        <span class="name">Mozart</span>
      </span>
      <span class="spacer"></span>
      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        disabled
        [hlmTooltip]="'Coming in 1.8d'"
      >
        Settings
      </button>
      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        disabled
        [hlmTooltip]="'Coming in 1.8d'"
      >
        About
      </button>
    </header>
  `,
  styles: `
    :host { display: block; }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      background: hsl(var(--card));
      border-bottom: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .brand { display: inline-flex; align-items: center; gap: 6px; }
    .diamond { color: hsl(var(--foreground)); font-size: 14px; line-height: 1; }
    .name { font-size: 13px; font-weight: 600; }
    .spacer { flex: 1 1 auto; }
  `,
})
export class TopBarComponent {}
