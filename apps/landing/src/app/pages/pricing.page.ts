import {
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
import { Router, RouterLink } from '@angular/router';
import {
  ANALYTICS_EVENTS,
  AnalyticsService,
} from '@mozart/shared-util-analytics';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideCircleDashed,
  lucideDownload,
  lucideLoaderCircle,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInput } from '@spartan-ui/input';
import { injectSeo } from '../shell/seo';

interface PricingFeature {
  readonly text: string;
  readonly available: boolean;
}

const LOCAL_FEATURES: readonly PricingFeature[] = [
  { text: 'Runs 100% on your machine', available: true },
  {
    text: 'Use your own AI provider (Claude Code, Codex)',
    available: true,
  },
  { text: 'Unlimited workspaces and projects', available: true },
  { text: 'Files never leave your device', available: true },
  { text: 'For individual use', available: true },
  { text: 'Local models, no provider needed', available: false },
];

const CLOUD_FEATURES: readonly PricingFeature[] = [
  { text: 'Everything in Local', available: true },
  { text: 'Team workspaces and collaboration', available: true },
  { text: 'Cloud sync across devices', available: true },
  {
    text: 'Token economy module: reduce LLM costs automatically',
    available: true,
  },
  {
    text: 'Workspace index and memory: agents with persistent context',
    available: true,
  },
  { text: 'Managed provider options hosted in the cloud', available: true },
  { text: 'Hosted integrations (CRM, email, calendar...)', available: true },
  { text: 'Priority support', available: true },
];

@Component({
  selector: 'app-pricing',
  imports: [FormField, HlmButton, HlmIconImports, HlmInput, NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCheck,
      lucideCircleDashed,
      lucideDownload,
      lucideLoaderCircle,
    }),
  ],
  template: `
    <!-- Hero -->
    <section
      class="mx-auto max-w-4xl px-4 pt-20 pb-12 text-center sm:px-6 lg:px-8"
    >
      <span
        class="bg-muted border-border text-muted-foreground mb-6 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
      >
        Pricing
      </span>
      <h1
        class="text-foreground text-4xl font-semibold tracking-tight md:text-5xl"
      >
        Powerful AI for your files.<br />Yours to keep.
      </h1>
      <p
        class="text-muted-foreground mx-auto mt-5 max-w-xl text-lg leading-relaxed"
      >
        Mozart is free forever for individuals. No subscription, no per-seat
        pricing. Connect your own AI provider and run agents on your files;
        provider usage is billed separately, by them.
      </p>
    </section>

    <!-- Pricing cards -->
    <section class="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
      <div class="grid gap-6 md:grid-cols-2">
        <!-- Local: Free -->
        <div
          class="bg-card border-border flex flex-col rounded-2xl border p-8 shadow-sm"
        >
          <div class="mb-6">
            <p
              class="text-muted-foreground mb-1 font-mono text-xs tracking-wider uppercase"
            >
              Mozart Local
            </p>
            <p class="text-foreground text-4xl font-bold tracking-tight">
              Free
            </p>
            <p class="text-muted-foreground mt-1 text-sm">forever</p>
          </div>

          <ul class="mb-8 flex-1 space-y-3">
            @for (feature of localFeatures; track feature.text) {
              <li class="flex items-start gap-2.5">
                <ng-icon
                  hlm
                  [name]="
                    feature.available ? 'lucideCheck' : 'lucideCircleDashed'
                  "
                  size="sm"
                  class="mt-0.5 shrink-0"
                  [class]="
                    feature.available
                      ? 'text-emerald-500'
                      : 'text-muted-foreground'
                  "
                />
                <span
                  class="text-sm"
                  [class]="
                    feature.available
                      ? 'text-foreground/80'
                      : 'text-muted-foreground'
                  "
                >
                  {{ feature.text }}
                  @if (!feature.available) {
                    <span class="text-muted-foreground/70 font-mono text-xs">
                      · planned
                    </span>
                  }
                </span>
              </li>
            }
          </ul>

          <a
            hlmBtn
            routerLink="/download"
            variant="default"
            size="lg"
            class="group w-full justify-between"
          >
            Download developer preview
            <ng-icon
              hlm
              size="sm"
              name="lucideDownload"
              class="transition-transform duration-200 group-hover:translate-y-0.5"
            />
          </a>
        </div>

        <div
          class="bg-card border-border relative flex flex-col rounded-2xl border p-8"
        >
          <div
            class="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 font-mono text-xs text-muted-foreground"
          >
            <ng-icon hlm size="xs" name="lucideCircleDashed" />
            Planned
          </div>

          <div class="mb-6">
            <p
              class="text-muted-foreground mb-1 font-mono text-xs tracking-wider uppercase"
            >
              Mozart Cloud
            </p>
            <p class="text-foreground text-4xl font-bold tracking-tight">$90</p>
            <p class="text-muted-foreground mt-1 text-sm">
              per tenant / mo, excl. tax
            </p>
          </div>

          <ul class="mb-8 flex-1 space-y-3">
            @for (feature of cloudFeatures; track feature.text) {
              <li class="flex items-start gap-2.5">
                <ng-icon
                  hlm
                  name="lucideCheck"
                  size="sm"
                  class="mt-0.5 shrink-0 text-muted-foreground"
                />
                <span class="text-muted-foreground text-sm">{{
                  feature.text
                }}</span>
              </li>
            }
          </ul>

          <button
            hlmBtn
            type="button"
            variant="outline"
            size="lg"
            class="w-full justify-between"
            (click)="focusCloudEmail()"
          >
            Get notified when it launches
            <ng-icon hlm size="sm" name="lucideArrowRight" />
          </button>
        </div>
      </div>

      <!-- Cloud waitlist -->
      <div class="bg-muted/40 border-border mt-6 rounded-xl border p-6">
        <p class="text-foreground mb-1 font-semibold">
          Interested in Mozart Cloud?
        </p>
        <p class="text-muted-foreground mb-4 text-sm">
          Be the first to know when team workspaces and cloud sync ship.
        </p>

        @if (cloudDone()) {
          <p class="text-foreground text-sm font-semibold">
            You're on the list. We'll reach out when Mozart Cloud is ready.
          </p>
        } @else {
          <div class="flex max-w-md flex-col gap-2 sm:flex-row">
            <input
              #cloudEmailInput
              hlmInput
              type="email"
              autocomplete="email"
              placeholder="you@company.com"
              class="w-full"
              [formField]="cloudForm.email"
            />
            <input
              type="text"
              name="hp2"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
              class="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <button
              hlmBtn
              type="button"
              variant="secondary"
              [disabled]="cloudPending()"
              class="group shrink-0 justify-between gap-2"
              (click)="submitCloudWaitlist()"
            >
              Notify me
              @if (cloudPending()) {
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
            cloudForm.email().touched() && cloudForm.email().errors().length
          ) {
            <p class="text-destructive mt-2 text-sm">
              {{ cloudForm.email().errors()[0]?.message }}
            </p>
          }
          @if (cloudServerError(); as msg) {
            <p class="text-destructive mt-2 text-sm">{{ msg }}</p>
          }
          <p class="text-muted-foreground/70 mt-3 font-mono text-xs">
            No spam. One email when it's your turn.
          </p>
        }
      </div>
    </section>

    <!-- Why free? -->
    <section
      class="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 lg:px-8"
    >
      <div class="mx-auto max-w-3xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          Why free?
        </p>
        <h2 class="text-foreground mb-6 text-2xl font-semibold tracking-tight">
          AI should be accessible to everyone.
        </h2>
        <div class="text-muted-foreground space-y-4 text-base leading-relaxed">
          <p>
            Most AI tools run in someone else's cloud and tie you to a single
            model. We built Mozart Local to flip that: agents that work on your
            files, on your machine, with the AI provider you choose. Free,
            forever.
          </p>
          <p>
            For teams and companies, there's Mozart Cloud: collaboration, sync,
            and hosted integrations. That's what sustains the free local
            experience.
          </p>
        </div>
      </div>
    </section>

    <!-- AI costs + Local vs Cloud -->
    <section class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div class="grid gap-6 md:grid-cols-2">
        <div class="border-border rounded-xl border p-6">
          <p class="text-foreground mb-1 font-semibold">
            What about AI usage costs?
          </p>
          <p class="text-muted-foreground text-sm leading-relaxed">
            Mozart itself is free. Agents run with the AI provider accounts you
            connect, Claude Code and Codex today, and any usage is billed by
            your provider under your plan with them, not by Mozart. Local model
            support is planned: once it ships, compatible models will be able to
            run directly on your machine. More providers are on the roadmap.
          </p>
        </div>

        <div class="border-border rounded-xl border p-6">
          <p class="text-foreground mb-1 font-semibold">Local vs. Cloud</p>
          <p class="text-muted-foreground text-sm leading-relaxed">
            Mozart Local is designed for individual use. Each person on your
            team can run their own local instance today. Shared workspaces where
            agents, files, and history are synchronized across a team are coming
            in Mozart Cloud. If you need team features now, join the Cloud
            waitlist above and we'll keep you posted.
          </p>
        </div>
      </div>
    </section>
  `,
})
export default class PricingPage {
  protected readonly localFeatures = LOCAL_FEATURES;
  protected readonly cloudFeatures = CLOUD_FEATURES;

  protected readonly cloudFormData = signal({ email: '' });
  protected readonly cloudForm = form(this.cloudFormData, (f) => {
    required(f.email, { message: 'Email is required.' });
    email(f.email, { message: 'Enter a valid email address.' });
  });
  protected readonly cloudPending = signal(false);
  protected readonly cloudServerError = signal<string | null>(null);
  protected readonly cloudDone = signal(false);

  private readonly cloudEmailInputRef =
    viewChild<ElementRef<HTMLInputElement>>('cloudEmailInput');

  protected focusCloudEmail(): void {
    const el = this.cloudEmailInputRef()?.nativeElement;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.focus(), 250);
  }

  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly openedAt = Date.now();

  constructor() {
    injectSeo()({
      title: 'Pricing | Mozart: Free AI Workspace',
      description:
        'Mozart is free forever for individuals. Runs locally, no subscription. Connect your own AI provider (Claude Code, Codex); usage billed by them. Local models planned.',
      path: '/pricing',
      type: 'website',
    });
  }

  protected submitCloudWaitlist(): void {
    void submit(this.cloudForm, { action: async () => this.doCloudSubmit() });
  }

  private async doCloudSubmit(): Promise<void> {
    if (this.cloudPending()) return;

    const emailVal = this.cloudFormData().email.trim().toLowerCase();
    const path = this.router.url.split('?')[0] || '/pricing';
    this.analytics.capture(ANALYTICS_EVENTS.waitlistSubmitted, {
      vertical: 'other',
      source: 'pricing_cloud',
      path,
    });
    this.cloudPending.set(true);
    this.cloudServerError.set(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailVal,
          vertical: 'other',
          source: 'pricing_cloud',
          formAge: Date.now() - this.openedAt,
        }),
      });
      if (!res.ok) {
        this.cloudServerError.set('Something went wrong. Try again shortly.');
        this.analytics.capture(ANALYTICS_EVENTS.waitlistFailed, {
          vertical: 'other',
          source: 'pricing_cloud',
          reason: `http_${res.status}`,
        });
        return;
      }
      this.cloudDone.set(true);
      this.analytics.capture(ANALYTICS_EVENTS.waitlistSucceeded, {
        vertical: 'other',
        source: 'pricing_cloud',
        already: false,
      });
    } catch {
      this.cloudServerError.set('Network error. Try again.');
      this.analytics.capture(ANALYTICS_EVENTS.waitlistFailed, {
        vertical: 'other',
        source: 'pricing_cloud',
        reason: 'network',
      });
    } finally {
      this.cloudPending.set(false);
    }
  }
}
