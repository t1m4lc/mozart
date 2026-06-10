import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { VerticalSlug } from './vertical-config';
import { VERTICALS } from './verticals';

@Component({
  selector: 'app-other-verticals',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-5 font-mono text-xs tracking-wider uppercase"
        >
          Mozart for other roles
        </p>
        <ul class="flex flex-wrap gap-x-6 gap-y-2">
          @for (vertical of others(); track vertical.slug) {
            <li>
              <a
                [routerLink]="'/for/' + vertical.slug"
                class="text-foreground hover:text-foreground/70 text-sm underline decoration-dotted underline-offset-4 transition-colors"
              >
                {{ vertical.jobTitle }} →
              </a>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class OtherVerticalsComponent {
  readonly current = input.required<VerticalSlug>();

  protected readonly others = computed(() =>
    VERTICALS.filter((vertical) => vertical.slug !== this.current()),
  );
}
