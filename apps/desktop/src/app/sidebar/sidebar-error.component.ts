/**
 * `SidebarErrorComponent` — error banner shown by `SidebarComponent`
 * when `ProjectStore.errorDetail()` is non-null. Renders the error's
 * human message + a `[Retry]` button that re-emits to the parent so the
 * sidebar can re-invoke `ProjectStore.refresh()`.
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { MozartError } from '../services/mozart-error';

@Component({
  selector: 'app-sidebar-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports],
  template: `
    <div class="card" role="alert">
      <p class="message">{{ error().message }}</p>
      @if (error().recovery) {
        <p class="recovery">{{ error().recovery }}</p>
      }
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        (click)="retry.emit()"
      >
        Retry
      </button>
    </div>
  `,
  styles: `
    :host { display: block; padding: 12px; }
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--accent-error-br, hsl(var(--border)));
      border-radius: var(--radius-md);
      background: var(--accent-error-bg, transparent);
    }
    .message {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 13px;
      color: hsl(var(--foreground));
    }
    .recovery {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class SidebarErrorComponent {
  readonly error = input.required<MozartError>();
  readonly retry = output<void>();
}
