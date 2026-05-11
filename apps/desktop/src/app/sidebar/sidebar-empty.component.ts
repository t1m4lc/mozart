/**
 * `SidebarEmptyComponent` — empty-state card shown by `SidebarComponent`
 * when `ProjectStore.projects()` is `[]`. Surfaces the disabled
 * `[+ Add repository]` CTA with the 1.8d milestone tooltip.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

@Component({
  selector: 'app-sidebar-empty',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmTooltipImports],
  template: `
    <div class="card">
      <p class="copy">No projects yet.</p>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        disabled
        [hlmTooltip]="'Coming in 1.8d'"
      >
        + Add repository
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 12px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
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
export class SidebarEmptyComponent {}
