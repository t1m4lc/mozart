import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

// Phase 3b — collapsible body wrapper. Uses the
// `grid-template-rows: 0fr → 1fr` trick (per spec §5.3) so dynamic
// content collapses smoothly without measuring height. Reduced motion
// removes the transition but the toggle still works.

@Component({
  selector: 'hlm-turn-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="body-grid grid"
      [style.grid-template-rows]="collapsed() ? '0fr' : '1fr'"
    >
      <div class="min-h-0 overflow-hidden">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .body-grid { transition: grid-template-rows 200ms ease; }
    @media (prefers-reduced-motion: reduce) {
      .body-grid { transition: none; }
    }
  `,
})
export class TurnBody {
  readonly collapsed = input<boolean>(false);
}
