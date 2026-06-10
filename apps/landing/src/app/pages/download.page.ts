import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ANALYTICS_EVENTS,
  AnalyticsService,
} from '@mozart/shared-util-analytics';
import { MOZART_LINKS } from '@mozart/shared-util-mozart-links';
import { OsService } from '@mozart/shared-util-os';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmInput } from '@spartan-ui/input';
import { detectOsTag } from '../shell/analytics/detect-os';
import { injectSeo } from '../shell/seo';
import { SITE_CONFIG } from '../shell/site-config';
import type { WaitlistModalContext } from './for/_shared/waitlist-modal.component';
import { WaitlistModalComponent } from './for/_shared/waitlist-modal.component';

const WAITLIST_MODAL_CLASS =
  'w-full max-w-md gap-0 p-6 ' +
  'max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none ' +
  'max-sm:!border-0 max-sm:!mx-0 max-sm:!mt-auto max-sm:!mb-0';

type OsKey = 'mac' | 'mac-intel' | 'windows' | 'linux';

const PLATFORMS: { os: OsKey; label: string }[] = [
  { os: 'mac', label: 'Download for Mac (Apple Silicon)' },
  { os: 'mac-intel', label: 'Download for Mac (Intel)' },
  { os: 'windows', label: 'Download for Windows' },
  { os: 'linux', label: 'Download for Linux' },
];

const REQUIREMENTS = [
  'Git installed on your machine',
  'A GitHub account',
  'Claude Code CLI or an OpenAI Codex API key',
];

@Component({
  selector: 'app-download',
  imports: [HlmButton, HlmInput, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideLoaderCircle })],
  template: `
    <main class="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div class="mb-10 text-center">
        <span
          class="bg-muted text-muted-foreground mb-4 inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest"
        >
          Developer preview
        </span>
        <h1 class="text-foreground text-4xl font-bold tracking-tight">
          Download Mozart
        </h1>
        <p class="text-muted-foreground mt-4 text-base leading-relaxed">
          Mozart is in developer preview and works best if you’re comfortable
          with Git and a terminal. Developers can
          <a
            [href]="betaSignupHref"
            class="text-foreground underline underline-offset-4 decoration-dotted hover:opacity-70 transition-opacity"
            target="_blank"
            rel="noopener"
            >request early access</a
          >.
        </p>
      </div>

      <!-- Requirements -->
      <div class="bg-muted/50 border-border mb-8 rounded-xl border p-5">
        <p class="text-foreground mb-3 text-sm font-semibold">Requirements</p>
        <ul class="space-y-1.5">
          @for (req of requirements; track req) {
            <li class="text-muted-foreground flex items-center gap-2 text-sm">
              <span class="text-foreground/40 font-mono text-xs">·</span>
              {{ req }}
            </li>
          }
        </ul>
      </div>

      <!-- Download buttons -->
      <div class="flex w-full flex-col gap-3">
        @if (requireAccessCode) {
          <div class="space-y-1.5">
            <input
              hlmInput
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              placeholder="Beta access code"
              class="w-full uppercase tracking-widest"
              [value]="code()"
              (input)="onCode($event)"
            />
            @if (error(); as message) {
              <p class="text-destructive text-sm">{{ message }}</p>
            }
          </div>
        }

        @for (platform of sortedPlatforms(); track platform.os) {
          <button
            hlmBtn
            [variant]="platform.os === primaryOs() ? 'default' : 'outline'"
            size="lg"
            type="button"
            [disabled]="pending()"
            (click)="download(platform.os)"
            class="w-full justify-center py-5"
          >
            @if (pending() && downloadingOs() === platform.os) {
              <ng-icon
                name="lucideLoaderCircle"
                class="mr-2 h-4 w-4 animate-spin"
              />
            }
            {{ platform.label }}
          </button>
        }
      </div>

      <!-- Non-developer callout -->
      <div class="border-border mt-10 rounded-xl border p-5 text-center">
        <p class="text-foreground mb-1 text-sm font-semibold">
          Not a developer?
        </p>
        <p class="text-muted-foreground mb-3 text-sm">
          A no-code experience for sales, marketing, recruiting, and small teams
          is what we're building next.
        </p>
        <button
          hlmBtn
          type="button"
          variant="outline"
          size="sm"
          (click)="openWaitlist()"
        >
          Join the waitlist
        </button>
      </div>
    </main>
  `,
})
export default class DownloadPageComponent implements OnInit {
  private readonly setSeo = injectSeo();
  private readonly os = inject(OsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly dialog = inject(HlmDialogService);

  protected readonly requireAccessCode =
    SITE_CONFIG.downloads.requireAccessCode;
  protected readonly betaSignupHref = MOZART_LINKS.betaSignup;
  protected readonly requirements = REQUIREMENTS;

  protected readonly code = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly downloadingOs = signal<OsKey | null>(null);

  protected readonly primaryOs = computed<OsKey>(() => {
    if (this.os.isMac())
      return this.os.macArch() === 'intel' ? 'mac-intel' : 'mac';
    if (this.os.isWindows()) return 'windows';
    if (this.os.isLinux()) return 'linux';
    return 'mac';
  });

  protected readonly sortedPlatforms = computed(() => {
    const primary = this.primaryOs();
    return [
      ...PLATFORMS.filter((p) => p.os === primary),
      ...PLATFORMS.filter((p) => p.os !== primary),
    ];
  });

  ngOnInit() {
    this.setSeo({
      title: 'Download Mozart',
      description:
        'Download the Mozart developer preview for Mac, Windows, and Linux. Requires git, a GitHub account, and Claude Code CLI or Codex.',
      path: '/download',
    });
  }

  protected openWaitlist(): void {
    const ctx: WaitlistModalContext = { vertical: 'other', jobTitle: 'Mozart' };
    this.dialog.open(WaitlistModalComponent, {
      contentClass: WAITLIST_MODAL_CLASS,
      context: ctx,
    });
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  protected async download(targetOs: OsKey): Promise<void> {
    if (this.pending()) return;
    const code = this.code().trim();
    if (this.requireAccessCode && !code) {
      this.error.set('Enter your beta access code.');
      return;
    }

    this.pending.set(true);
    this.downloadingOs.set(targetOs);
    this.error.set(null);
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ os: targetOs, code }),
      });
      if (res.status === 401) {
        this.error.set('Invalid access code.');
        return;
      }
      if (!res.ok) {
        this.error.set('Download unavailable right now. Try again shortly.');
        return;
      }
      const { url } = (await res.json()) as { url: string };
      this.analytics.capture(ANALYTICS_EVENTS.downloaded, {
        source: 'download_page',
        section: 'download',
        os: detectOsTag(this.os),
        target: targetOs,
        cta: 'primary',
      });
      window.location.href = url;
    } catch {
      this.error.set('Network error. Try again.');
    } finally {
      this.pending.set(false);
      this.downloadingOs.set(null);
    }
  }
}
