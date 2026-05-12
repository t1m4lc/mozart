/**
 * `EmptyRightComponent` — scaffold for the right panel.
 *
 * Three stacked, empty sections separated by theme-bound borders:
 *   1. Files
 *   2. Run
 *   3. Terminal
 *
 * v0.0.1 deliberately ships empty content areas — the diff viewer,
 * run output, and terminal embedding land in later plans (09–10).
 * Visibility is controlled by `ShellStore.showRightPanel` via the
 * top-bar toggle in `app-shell`.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-empty-right',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel-section border-b border-border" aria-label="Files">
      <header class="section-label">Files</header>
      <div class="section-body"></div>
    </section>

    <section class="panel-section border-b border-border" aria-label="Run">
      <header class="section-label">Run</header>
      <div class="section-body"></div>
    </section>

    <section class="panel-section" aria-label="Terminal">
      <header class="section-label">Terminal</header>
      <div class="section-body"></div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
    .panel-section {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      padding: 12px 16px;
    }
    .section-label {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: hsl(var(--muted-foreground));
      margin-bottom: 8px;
    }
    .section-body {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
})
export class EmptyRightComponent {}
