import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInput } from '@spartan-ui/input';
import {
  ANALYTICS_EVENTS,
  AnalyticsService,
} from '@mozart/shared-util-analytics';
import type { VerticalSlug } from './vertical-config';

@Component({
  selector: 'app-vertical-waitlist',
  imports: [FormField, HlmButton, HlmIconImports, HlmInput, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowRight, lucideLoaderCircle })],
  host: { class: 'block' },
  template: `
    <section id="waitlist" class="border-t border-border px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <div class="max-w-lg">
          <p
            class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
          >
            Early access
          </p>
          <h2
            class="text-foreground mb-3 text-2xl font-semibold tracking-tight"
          >
            Get early access
          </h2>
          <p class="text-muted-foreground mb-6 text-sm">
            Leave your email and we'll reach out personally when your spot is
            ready.
          </p>

          @if (done()) {
            <p class="text-foreground text-sm font-semibold">
              @if (already()) {
                You're already on the list. We'll be in touch.
              } @else {
                You're on the list. Talk soon.
              }
            </p>
          } @else {
            <form
              class="flex max-w-md flex-col gap-2 sm:flex-row"
              (submit)="onSubmit($event)"
            >
              <input
                hlmInput
                type="email"
                autocomplete="email"
                placeholder="you@company.com"
                class="w-full"
                [formField]="waitlistForm.email"
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
                type="submit"
                variant="default"
                [disabled]="pending()"
                class="group shrink-0 justify-between gap-2"
              >
                Notify me
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
            </form>
            @if (waitlistForm.email().touched() && waitlistForm.email().errors().length) {
              <p class="text-destructive mt-2 text-sm">{{ waitlistForm.email().errors()[0]?.message }}</p>
            }
            @if (serverError(); as message) {
              <p class="text-destructive mt-2 text-sm">{{ message }}</p>
            }
          }

          <p class="text-muted-foreground/70 mt-4 font-mono text-xs">
            No spam. One email when it's your turn.
          </p>
        </div>
      </div>
    </section>
  `,
})
export class VerticalWaitlistComponent {
  readonly vertical = input.required<VerticalSlug>();
  readonly jobTitle = input.required<string>();

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

  protected onHoneypot(event: Event): void {
    this.honeypot.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.waitlistForm, { action: async () => this.doSubmit() });
  }

  private async doSubmit(): Promise<void> {
    if (this.pending()) return;

    const emailVal = this.formData().email.trim().toLowerCase();
    const vertical = this.vertical();
    const source = `for_${vertical}`;
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
