import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { VerticalFaqEntry } from './vertical-config';

@Component({
  selector: 'app-vertical-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="border-t border-border px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          Frequently asked questions
        </p>
        <h2 class="text-foreground mb-10 text-2xl font-semibold tracking-tight">
          Common questions
        </h2>

        <dl class="max-w-3xl space-y-6">
          @for (entry of faq(); track entry.question) {
            <div class="border-b border-border pb-6 last:border-b-0 last:pb-0">
              <dt class="text-foreground mb-1.5 font-semibold">
                {{ entry.question }}
              </dt>
              <dd class="text-muted-foreground text-sm leading-relaxed">
                {{ entry.answer }}
              </dd>
            </div>
          }
        </dl>

        <p class="text-muted-foreground mt-8 text-sm">
          More questions?
          <a
            href="/discord"
            class="text-foreground hover:text-foreground/70 ml-1 underline underline-offset-4 decoration-dotted transition-colors"
          >
            Ask on Discord →
          </a>
        </p>
      </div>
    </section>
  `,
})
export class VerticalFaqComponent {
  readonly faq = input.required<readonly VerticalFaqEntry[]>();
}
