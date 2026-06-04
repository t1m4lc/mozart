import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInput } from '@spartan-ui/input';
import { OsService } from '@mozart/shared-util-os';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideLoaderCircle } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { ANALYTICS_EVENTS, AnalyticsService } from '@mozart/shared-util-analytics';
import { detectOsTag } from './analytics/detect-os';
import { type PageSection, pageSection } from './analytics/page-section';
import { SITE_CONFIG } from './site-config';

const OTHER_LABELS: Record<string, string> = {
  mac: 'Download for Windows or Linux',
  'mac-intel': 'Download for Windows or Linux',
  windows: 'Download for Mac or Linux',
  linux: 'Download for Mac or Windows',
};

type OsKey = 'mac' | 'mac-intel' | 'windows' | 'linux';

type Platform = {
  readonly os: OsKey;
  readonly label: string;
  readonly icon: 'apple' | 'windows' | 'linux';
};

export const DOWNLOAD_DIALOG_SOURCES = {
  hero: 'hero',
  header: 'header',
} as const;

export type DownloadDialogSource =
  (typeof DOWNLOAD_DIALOG_SOURCES)[keyof typeof DOWNLOAD_DIALOG_SOURCES];

type DownloadDialogContext = {
  readonly source?: DownloadDialogSource;
  readonly section?: PageSection;
};

// Pass to `dialog.open(DownloadDialogComponent, { contentClass: ... })`.
// Desktop keeps the default `sm:max-w-lg` card. Mobile expands to a true
// fullscreen sheet so the tall CTAs + footnote stop overflowing past the
// viewport on small phones.
export const DOWNLOAD_DIALOG_CLASS =
  'flex flex-col gap-0 ' +
  'max-sm:!w-screen max-sm:!h-[100dvh] max-sm:!max-w-none ' +
  'max-sm:!rounded-none max-sm:!border-0 max-sm:!mx-0 max-sm:!my-0 ' +
  'max-sm:!p-0';

const PLATFORMS: Record<OsKey, Platform> = {
  mac: { os: 'mac', label: 'Download for Mac (Apple Silicon)', icon: 'apple' },
  'mac-intel': {
    os: 'mac-intel',
    label: 'Download for Mac (Intel)',
    icon: 'apple',
  },
  windows: { os: 'windows', label: 'Download for Windows', icon: 'windows' },
  linux: { os: 'linux', label: 'Download for Linux', icon: 'linux' },
};

@Component({
  selector: 'app-download-dialog',
  imports: [HlmButton, HlmDialogImports, HlmIconImports, HlmInput, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowRight, lucideLoaderCircle })],
  template: `
    <header class="border-border max-sm:border-b max-sm:p-6 sm:pb-2">
      <h3 hlmDialogTitle>Download Mozart</h3>
      <p hlmDialogDescription>
        @if (requireAccessCode) {
          Mozart is in private beta. Enter your access code, then grab the
          build for your platform.
        } @else {
          Grab the build for your platform.
        }
      </p>
    </header>

    <div
      class="min-h-0 flex-1 space-y-3 overflow-y-auto max-sm:px-6 max-sm:pb-6 sm:pt-4"
    >
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
            (keydown.enter)="download(primary(), 'primary')"
          />
          @if (error(); as message) {
            <p class="text-destructive text-sm">{{ message }}</p>
          }
        </div>
      }

      <button
        hlmBtn
        size="lg"
        type="button"
        [disabled]="pending()"
        (click)="download(primary(), 'primary')"
        class="group w-full justify-between py-6"
      >
        <span class="flex items-center gap-2">
          @if (pending()) {
            <ng-icon
              hlm
              size="sm"
              name="lucideLoaderCircle"
              class="h-5 w-5 animate-spin"
            />
          } @else {
            @switch (primary().icon) {
              @case ('apple') {
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                  />
                </svg>
              }
              @case ('windows') {
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M3 5.5 10.5 4.4v7.1H3zM10.5 12.5v7.1L3 18.5v-6zM11.5 4.25 21 3v8.5h-9.5zM21 12.5V21l-9.5-1.25V12.5z"
                  />
                </svg>
              }
              @case ('linux') {
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 2c-1.93 0-3.5 1.57-3.5 3.5 0 .56.14 1.09.38 1.56C8.13 8.06 7 9.92 7 12c0 1.3.5 2.49 1.31 3.39-.74.62-1.31 1.45-1.31 2.61 0 1.93.5 4 4.5 4 1.42 0 3.39-.5 4-1.5.61 1 2.58 1.5 4 1.5 4 0 4.5-2.07 4.5-4 0-1.16-.57-1.99-1.31-2.61C23.5 14.49 24 13.3 24 12c0-2.08-1.13-3.94-2.38-4.94.24-.47.38-1 .38-1.56C22 3.57 20.43 2 18.5 2c-.96 0-1.83.39-2.47 1.02C15.4 2.42 14.5 2 13.5 2zM10 7c.55 0 1 .67 1 1.5S10.55 10 10 10s-1-.67-1-1.5S9.45 7 10 7m4 0c.55 0 1 .67 1 1.5s-.45 1.5-1 1.5-1-.67-1-1.5.45-1.5 1-1.5"
                  />
                </svg>
              }
            }
          }
          <span class="text-base">{{ primary().label }}</span>
        </span>
        <kbd
          class="bg-background/20 border-foreground/20 inline-flex h-6 w-6 items-center justify-center rounded-md border font-mono text-xs font-medium"
        >
          ⏎
        </kbd>
      </button>

      <button
        hlmBtn
        variant="outline"
        size="lg"
        type="button"
        (click)="goToAllPlatforms()"
        class="group w-full justify-between py-4"
      >
        <span class="text-base">{{ otherLabel() }}</span>
        <ng-icon hlm size="sm" name="lucideArrowRight" class="h-4 w-4" />
      </button>
    </div>
  `,
})
export class DownloadDialogComponent {
  protected readonly os = inject(OsService);
  private readonly ref = inject(BrnDialogRef);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  private readonly ctx =
    injectBrnDialogContext<DownloadDialogContext>({ optional: true });
  private readonly source: DownloadDialogSource | 'unknown' =
    this.ctx?.source ?? 'unknown';

  protected readonly requireAccessCode = SITE_CONFIG.downloads.requireAccessCode;
  protected readonly code = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);

  // Captured at dialog-open time so analytics see the page that triggered the
  // modal, not whatever the router lands on after a click.
  private readonly fromPath =
    this.router.url.split('?')[0].split('#')[0] || '/';
  private readonly section: PageSection =
    this.ctx?.section ?? pageSection(this.fromPath);

  protected readonly primary = computed<Platform>(() => {
    if (this.os.isMac()) {
      return this.os.macArch() === 'intel'
        ? PLATFORMS['mac-intel']
        : PLATFORMS.mac;
    }
    if (this.os.isWindows()) return PLATFORMS.windows;
    if (this.os.isLinux()) return PLATFORMS.linux;
    return PLATFORMS.mac;
  });

  protected readonly otherLabel = computed<string>(
    () => OTHER_LABELS[this.primary().os] ?? 'All download options',
  );

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  protected async download(
    platform: Platform,
    cta: 'primary' | 'secondary',
  ): Promise<void> {
    if (this.pending()) return;
    const code = this.code().trim();
    if (this.requireAccessCode && !code) {
      this.error.set('Enter your beta access code.');
      return;
    }

    this.pending.set(true);
    this.error.set(null);
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ os: platform.os, code }),
      });
      if (res.status === 401) {
        this.error.set('Invalid access code.');
        return;
      }
      if (!res.ok) {
        this.error.set('Download unavailable right now — try again shortly.');
        return;
      }
      const { url } = (await res.json()) as { url: string };
      this.analytics.capture(ANALYTICS_EVENTS.downloaded, {
        source: this.source,
        section: this.section,
        os: detectOsTag(this.os),
        target: platform.os,
        cta,
        dl_id: this.analytics.distinctId(),
      });
      this.ref.close();
      window.location.href = url;
    } catch {
      this.error.set('Network error — try again.');
    } finally {
      this.pending.set(false);
    }
  }

  protected goToAllPlatforms(): void {
    this.ref.close();
    void this.router.navigate(['/download']);
  }

  @HostListener('document:keydown.enter')
  protected onEnter(): void {
    if (typeof window === 'undefined') return;
    void this.download(this.primary(), 'primary');
  }
}
