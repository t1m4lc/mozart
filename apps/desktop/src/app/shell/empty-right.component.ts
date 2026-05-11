/**
 * `EmptyRightComponent` — placeholder shown in the right `<aside>` when
 * no workspace is selected. Muted-tone card per DESIGN.md state matrix.
 *
 * The right pane will host the diff viewer + terminal (plans 09–10);
 * for v0.0.1 it is purely a "nothing selected" surface.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-empty-right',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <p class="copy">No workspace selected.</p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .card {
      max-width: 260px;
      padding: 16px;
      border: 1px dashed hsl(var(--border));
      border-radius: var(--radius-md);
      background: transparent;
      text-align: center;
    }
    .copy {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class EmptyRightComponent {}
