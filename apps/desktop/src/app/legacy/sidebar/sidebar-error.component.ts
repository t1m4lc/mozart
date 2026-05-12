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
  host: { class: 'block p-3' },
  template: `
    <div class="card flex flex-col gap-2 p-3 rounded-md" role="alert">
      <p class="m-0 text-[13px] text-foreground">{{ error().message }}</p>
      @if (error().recovery) {
        <p class="m-0 text-xs text-muted-foreground">{{ error().recovery }}</p>
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
    .card {
      border: 1px solid var(--accent-error-br, hsl(var(--border)));
      background: var(--accent-error-bg, transparent);
    }
  `,
})
export class SidebarErrorComponent {
  readonly error = input.required<MozartError>();
  readonly retry = output<void>();
}
