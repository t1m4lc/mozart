import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  email,
  form,
  FormField,
  required,
  submit,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  ANALYTICS_EVENTS,
  AnalyticsService,
} from '@mozart/shared-util-analytics';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideLoaderCircle } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInput } from '@spartan-ui/input';
import type { VerticalSlug } from './vertical-config';

export type WaitlistVertical = VerticalSlug | 'other';

export type WaitlistModalContext = {
  readonly vertical: WaitlistVertical;
  readonly jobTitle: string;
};

const FOMO_LINES: Record<WaitlistVertical, string> = {
  sales:
    'The sales teams that move early on AI will have a real edge. Get ahead of your competition and reserve your spot.',
  marketing:
    'Content teams using AI are producing more without burning out. Join the list and be first when Mozart opens for marketing.',
  recruiting:
    'Recruiting is moving fast with AI. Get early access before we open to everyone.',
  'small-business':
    'Small teams that run on AI will outmove teams twice their size. Join the list and get access before we open to everyone.',
  other:
    "Mozart is in developer preview today. Join the waitlist and we'll reach out personally when the full experience is ready.",
};

@Component({
  selector: 'app-waitlist-modal',
  imports: [
    FormField,
    HlmButton,
    HlmDialogImports,
    HlmIconImports,
    HlmInput,
    NgIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowRight, lucideLoaderCircle })],
  template: `
    <header class="pb-4">
      <h3 hlmDialogTitle class="text-lg">
        Early access: Mozart for {{ ctx.jobTitle }}
      </h3>
      <p hlmDialogDescription class="text-sm leading-relaxed">
        {{ fomoLine }}
      </p>
    </header>

    @if (done()) {
      <div class="py-4">
        <p class="text-foreground font-semibold">
          @if (already()) {
            You're already on the list. We'll be in touch.
          } @else {
            You're on the list 🎉 Talk soon.
          }
        </p>
        <p class="text-muted-foreground mt-1 text-sm">
          We'll reach out personally when your spot is ready.
        </p>
      </div>
    } @else {
      <div class="space-y-3 pt-2">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            #emailInput
            hlmInput
            type="email"
            autocomplete="email"
            placeholder="you@company.com"
            class="w-full"
            [formField]="waitlistForm.email"
            (keydown.enter)="onSubmit()"
          />
          <input
            type="text"
            name="hp"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
            class="absolute -left-[9999px] h-0 w-0 opacity-0"
            [value]="honeypot()"
            (input)="onHoneypot($event)"
          />
          <button
            hlmBtn
            type="button"
            variant="default"
            [disabled]="pending()"
            class="group shrink-0 justify-between gap-2"
            (click)="onSubmit()"
          >
            Reserve my spot
            @if (pending()) {
              <ng-icon
                hlm
                size="sm"
                name="lucideLoaderCircle"
                class="animate-spin"
              />
            } @else {
              <ng-icon
                hlm
                size="sm"
                name="lucideArrowRight"
                class="transition-transform duration-200 group-hover:translate-x-1"
              />
            }
          </button>
        </div>

        @if (
          waitlistForm.email().touched() && waitlistForm.email().errors().length
        ) {
          <p class="text-destructive text-sm">
            {{ waitlistForm.email().errors()[0]?.message }}
          </p>
        }
        @if (serverError(); as message) {
          <p class="text-destructive text-sm">{{ message }}</p>
        }

        <p class="text-muted-foreground/70 font-mono text-xs">
          No spam. One email when it's your turn.
        </p>
      </div>
    }
  `,
})
export class WaitlistModalComponent implements AfterViewInit {
  protected readonly ctx = injectBrnDialogContext<WaitlistModalContext>({
    optional: true,
  }) ?? {
    vertical: 'other' as WaitlistVertical,
    jobTitle: 'Mozart',
  };

  protected readonly fomoLine =
    FOMO_LINES[this.ctx.vertical] ?? FOMO_LINES['sales'];

  private readonly ref = inject(BrnDialogRef);
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly openedAt = Date.now();

  protected readonly formData = signal({ email: '' });
  protected readonly waitlistForm = form(this.formData, (f) => {
    required(f.email, { message: 'Email is required.' });
    email(f.email, { message: 'Enter a valid email address.' });
  });
  protected readonly honeypot = signal('');
  protected readonly pending = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly done = signal(false);
  protected readonly already = signal(false);

  private readonly emailInputRef =
    viewChild<ElementRef<HTMLInputElement>>('emailInput');

  ngAfterViewInit(): void {
    setTimeout(() => this.emailInputRef()?.nativeElement.focus(), 50);
  }

  protected onHoneypot(event: Event): void {
    this.honeypot.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(): void {
    void submit(this.waitlistForm, { action: async () => this.doSubmit() });
  }

  private async doSubmit(): Promise<void> {
    if (this.pending()) return;

    const emailVal = this.formData().email.trim().toLowerCase();
    const vertical = this.ctx.vertical;
    const source = `for_${vertical}_modal`;
    const path = this.router.url.split('?')[0].split('#')[0] || '/';
    this.analytics.capture(ANALYTICS_EVENTS.waitlistSubmitted, {
      vertical,
      source,
      path,
    });

    this.pending.set(true);
    this.serverError.set(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailVal,
          vertical,
          source,
          hp: this.honeypot(),
          formAge: Date.now() - this.openedAt,
        }),
      });
      if (!res.ok) {
        this.serverError.set(
          res.status === 400
            ? 'Enter a valid email address.'
            : 'Something went wrong. Try again shortly.',
        );
        this.analytics.capture(ANALYTICS_EVENTS.waitlistFailed, {
          vertical,
          source,
          reason: `http_${res.status}`,
        });
        return;
      }
      const body = (await res.json()) as { ok: boolean; already?: boolean };
      this.already.set(body.already === true);
      this.done.set(true);
      this.analytics.capture(ANALYTICS_EVENTS.waitlistSucceeded, {
        vertical,
        source,
        already: body.already === true,
      });
    } catch {
      this.serverError.set('Network error. Try again.');
      this.analytics.capture(ANALYTICS_EVENTS.waitlistFailed, {
        vertical,
        source,
        reason: 'network',
      });
    } finally {
      this.pending.set(false);
    }
  }
}
