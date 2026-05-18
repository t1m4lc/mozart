import { ChangeDetectionStrategy, Component } from '@angular/core';

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

const FAQ: readonly FaqEntry[] = [
  {
    question: 'How does Mozart isolate Agent Runs?',
    answer:
      'Each Agent Run gets its own Workspace, a sandboxed copy of your Project. Changes stay scoped to that Workspace until you merge.',
  },
  {
    question: 'Which coding agents does Mozart support?',
    answer:
      'Mozart starts with Claude Code and is built with an adapter layer so more agents can be added over time.',
  },
  {
    question: 'Where does Mozart run?',
    answer:
      'Mozart runs locally on your machine and uses your existing agent credentials. Nothing leaves your device unless you push.',
  },
] as const;

@Component({
  selector: 'app-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-8 py-12 text-sm">
      <div class="mx-auto max-w-xl">
        <span
          class="bg-muted border-border text-muted-foreground mb-8 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
        >
          Frequently asked questions
        </span>
        <dl class="space-y-6">
          @for (entry of faq; track entry.question) {
            <div>
              <dt class="text-foreground font-semibold">
                {{ entry.question }}
              </dt>
              <dd
                class="text-muted-foreground mt-1 grid grid-cols-[auto_1fr] gap-x-2"
              >
                <span aria-hidden="true">└</span>
                <span class="">{{ entry.answer }}</span>
              </dd>
            </div>
          }
        </dl>
      </div>
    </section>
  `,
})
export class FaqComponent {
  protected readonly faq = FAQ;
}
