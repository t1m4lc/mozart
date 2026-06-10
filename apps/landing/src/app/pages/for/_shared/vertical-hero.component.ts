import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideHardDrive,
  lucideShield,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import type { WaitlistModalContext } from './waitlist-modal.component';
import { WaitlistModalComponent } from './waitlist-modal.component';
import type { VerticalConfig } from './vertical-config';

const MODAL_CLASS =
  'w-full max-w-md gap-0 p-6 ' +
  'max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none ' +
  'max-sm:!border-0 max-sm:!mx-0 max-sm:!mt-auto max-sm:!mb-0';

@Component({
  selector: 'app-vertical-hero',
  imports: [HlmButton, HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCheck,
      lucideHardDrive,
      lucideShield,
    }),
  ],
  host: { class: 'block' },
  template: `
    <section
      class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8 lg:pt-24 lg:pb-20"
    >
      <div class="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <!-- Left: headline + CTAs -->
        <div>
          <span
            class="bg-muted border-border text-muted-foreground inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
          >
            {{ config().heroEyebrow }}
          </span>

          <h1
            class="text-foreground mt-4 text-4xl font-semibold tracking-tight md:text-5xl"
          >
            {{ config().heroHeadline }}
          </h1>

          <p class="text-muted-foreground mt-5 max-w-lg text-lg leading-relaxed">
            {{ config().heroSubcopy }}
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <button
              hlmBtn
              type="button"
              variant="default"
              size="lg"
              (click)="openWaitlist()"
              class="border-primary group shadow-brand transition-shadow duration-300 hover:shadow-brand-strong"
            >
              Get early access
              <ng-icon
                hlm
                size="sm"
                name="lucideArrowRight"
                class="ml-2 transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>

          <!-- Trust badges -->
          <div
            class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5"
          >
            <span
              class="text-muted-foreground flex items-center gap-1 text-xs"
            >
              <ng-icon hlm size="xs" name="lucideCheck" class="text-primary" />
              Free forever
            </span>
            <span class="text-muted-foreground/40 text-xs" aria-hidden="true">·</span>
            <span
              class="text-muted-foreground flex items-center gap-1 text-xs"
            >
              <ng-icon hlm size="xs" name="lucideHardDrive" />
              Runs on your machine
            </span>
            <span class="text-muted-foreground/40 text-xs" aria-hidden="true">·</span>
            <span
              class="text-muted-foreground flex items-center gap-1 text-xs"
            >
              <ng-icon hlm size="xs" name="lucideShield" />
              Your data stays local
            </span>
          </div>
        </div>

        <!-- Right: mock product window (desktop only) -->
        <div
          aria-hidden="true"
          class="hidden lg:block rounded-xl border border-border bg-card overflow-hidden shadow-xl"
        >
          <!-- window chrome -->
          <div
            class="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3"
          >
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-muted-foreground/25"></div>
              <div class="size-3 rounded-full bg-muted-foreground/25"></div>
              <div class="size-3 rounded-full bg-muted-foreground/25"></div>
            </div>
            <span class="font-mono text-xs text-muted-foreground">
              {{ config().mock.windowTitle }}
            </span>
          </div>

          <!-- agent output -->
          <div class="space-y-5 p-5 font-mono text-xs">
            <div>
              <p class="text-primary">
                ▶ {{ config().mock.agentTask }}
              </p>
              <div class="mt-2 space-y-1 pl-4 border-l border-border">
                @for (inp of config().mock.inputs; track inp) {
                  <p class="text-muted-foreground">
                    <span class="text-muted-foreground/50">Reading </span
                    >{{ inp }}
                  </p>
                }
              </div>
            </div>

            <div class="rounded-md border border-border bg-background/60 p-3">
              <p
                class="text-muted-foreground mb-2.5 text-xs uppercase tracking-wider"
              >
                Ready for review
              </p>
              <div class="space-y-2">
                @for (out of config().mock.outputs; track out.file) {
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-foreground/70">✓ {{ out.file }}</span>
                    <span
                      class="shrink-0 cursor-default rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {{ out.label }}
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class VerticalHeroComponent {
  readonly config = input.required<VerticalConfig>();

  private readonly dialog = inject(HlmDialogService);

  protected openWaitlist(): void {
    const ctx: WaitlistModalContext = {
      vertical: this.config().slug,
      jobTitle: this.config().jobTitle,
    };
    this.dialog.open(WaitlistModalComponent, {
      contentClass: MODAL_CLASS,
      context: ctx,
    });
  }
}
