import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon } from '@ng-icons/core';

// IMP-022 — RadioCard primitive. A radio-style card with an icon
// block, title, subtitle, and an optional badge (e.g. "Soon"). Used
// by the Quick start template picker but generic enough to land
// anywhere the app wants a richer radio choice than the bare
// `<hlm-radio>` row.
//
// Lives under domains/projects/ for now because that's its only
// consumer ; promote to libs/ui/ if it picks up a second site (and
// the user signs off on the libs/ui touch).
@Component({
  selector: 'app-ui-radio-card',
  imports: [NgIcon, HlmIconImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      role="radio"
      [attr.aria-checked]="selected()"
      [disabled]="disabled()"
      (click)="pick.emit()"
      class="group/radiocard relative flex w-full flex-col items-start gap-2 rounded-md border border-border p-4 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 aria-checked:border-primary aria-checked:bg-primary/5"
    >
      @if (badge(); as b) {
        <span
          class="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ b }}
        </span>
      }
      <div class="flex size-8 items-center justify-center rounded-md bg-muted">
        @if (iconPath(); as path) {
          <img [src]="path" alt="" aria-hidden="true" class="size-5" />
        } @else if (icon(); as name) {
          <ng-icon hlm [name]="name" size="sm" />
        }
      </div>
      <div class="space-y-0.5">
        <p class="text-sm font-medium">{{ label() }}</p>
        @if (subtitle(); as s) {
          <p class="text-xs text-muted-foreground">{{ s }}</p>
        }
      </div>
    </button>
  `,
})
export class UiRadioCard {
  readonly selected = input.required<boolean>();
  readonly label = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly iconPath = input<string | null>(null);
  readonly badge = input<string | null>(null);
  readonly disabled = input<boolean>(false);

  // `pick` over `select` — `select` is a standard DOM event name and
  // angular-eslint rejects it as an output binding alias.
  readonly pick = output<void>();
}
