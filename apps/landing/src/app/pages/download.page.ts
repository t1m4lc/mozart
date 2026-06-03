import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AnalyticsService } from '@mozart/shared-util-analytics';
import { OsService } from '@mozart/shared-util-os';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmInput } from '@spartan-ui/input';
import { detectOsTag } from '../shell/analytics/detect-os';
import { injectSeo } from '../shell/seo';
import { SITE_CONFIG } from '../shell/site-config';

type OsKey = 'mac' | 'mac-intel' | 'windows' | 'linux';

const PLATFORMS: { os: OsKey; label: string }[] = [
  { os: 'mac', label: 'Download for Mac (Apple Silicon)' },
  { os: 'mac-intel', label: 'Download for Mac (Intel)' },
  { os: 'windows', label: 'Download for Windows' },
  { os: 'linux', label: 'Download for Linux' },
];

@Component({
  selector: 'app-download',
  imports: [HlmButton, HlmInput, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideLoaderCircle })],
  template: `
    <main
      class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <span
        class="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest"
      >
        Private beta
      </span>
      <h1 class="text-4xl font-bold tracking-tight">Download Mozart</h1>
      <p class="text-muted-foreground max-w-sm">
        @if (requireAccessCode) {
          Enter your beta access code to download for your platform.
        } @else {
          Get the build for your platform.
        }
      </p>

      <div class="flex w-full max-w-sm flex-col gap-3 py-16">
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
    </main>
  `,
})
export default class DownloadPageComponent implements OnInit {
  private readonly setSeo = injectSeo();
  private readonly os = inject(OsService);
  private readonly analytics = inject(AnalyticsService);

  protected readonly requireAccessCode =
    SITE_CONFIG.downloads.requireAccessCode;
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
        'Download the Mozart desktop app for Mac, Windows, and Linux.',
      path: '/download',
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
        this.error.set('Download unavailable right now — try again shortly.');
        return;
      }
      const { url } = (await res.json()) as { url: string };
      this.analytics.capture('download_started', {
        source: 'download_page',
        section: 'download',
        os: detectOsTag(this.os),
        target: targetOs,
        cta: 'primary',
        dl_id: this.analytics.distinctId(),
      });
      window.location.href = url;
    } catch {
      this.error.set('Network error — try again.');
    } finally {
      this.pending.set(false);
      this.downloadingOs.set(null);
    }
  }
}
