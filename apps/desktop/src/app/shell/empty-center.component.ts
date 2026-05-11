/**
 * `EmptyCenterComponent` — fills the centre pane when no workspace is
 * selected. Renders the v0.0.1 onboarding card per DESIGN.md state matrix.
 *
 * The `[+ New workspace]` button is disabled until 1.8d (workspace
 * creation dialog ships in plan 11) and carries a tooltip naming that
 * milestone.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

@Component({
  selector: 'app-empty-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmTooltipImports],
  template: `
    <div class="wrap">
      <div class="card">
        <p class="copy">
          Pick a workspace from the sidebar, or create a new one.
        </p>
        <button
          hlmBtn
          variant="outline"
          type="button"
          disabled
          [hlmTooltip]="'Coming in 1.8d'"
        >
          + New workspace
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: var(--bg-center);
    }
    .wrap { display: flex; align-items: center; justify-content: center; padding: 32px; }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 420px;
      padding: 24px;
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius-md);
      background: hsl(var(--card));
      text-align: center;
    }
    .copy {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 14px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class EmptyCenterComponent {}
