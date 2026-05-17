import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
} from '@angular/core';
import { HlmButton } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { OsService } from '@mozart/shared-util-os';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { SITE_CONFIG } from './site-config';

type Primary = {
  readonly label: string;
  readonly hint?: string;
  readonly href: string;
  readonly target?: '_blank';
  readonly icon: 'apple' | 'windows' | 'linux';
};

@Component({
  selector: 'app-download-dialog',
  imports: [HlmButton, HlmDialogImports, HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowRight })],
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Get Mozart</h3>
      <p hlmDialogDescription>
        @if (os.isMac()) {
          Mac build is ready. Windows and Linux are next.
        } @else if (os.isWindows()) {
          Windows build isn't ready yet. Join the waitlist and we'll ping you.
        } @else if (os.isLinux()) {
          Linux build isn't ready yet. Join the waitlist and we'll ping you.
        } @else {
          Mac build is ready. Windows and Linux are coming soon.
        }
      </p>
    </div>

    <div class="space-y-3 pt-2">
      <a
        hlmBtn
        size="lg"
        [attr.href]="primary().href"
        [attr.target]="primary().target ?? null"
        [attr.rel]="primary().target ? 'noopener noreferrer' : null"
        class="group w-full justify-between py-6"
      >
        <span class="flex items-center gap-2">
          @switch (primary().icon) {
            @case ('apple') {
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                />
              </svg>
            }
            @case ('windows') {
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 5.5 10.5 4.4v7.1H3zM10.5 12.5v7.1L3 18.5v-6zM11.5 4.25 21 3v8.5h-9.5zM21 12.5V21l-9.5-1.25V12.5z" />
              </svg>
            }
            @case ('linux') {
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  d="M12.5 2c-1.93 0-3.5 1.57-3.5 3.5 0 .56.14 1.09.38 1.56C8.13 8.06 7 9.92 7 12c0 1.3.5 2.49 1.31 3.39-.74.62-1.31 1.45-1.31 2.61 0 1.93.5 4 4.5 4 1.42 0 3.39-.5 4-1.5.61 1 2.58 1.5 4 1.5 4 0 4.5-2.07 4.5-4 0-1.16-.57-1.99-1.31-2.61C23.5 14.49 24 13.3 24 12c0-2.08-1.13-3.94-2.38-4.94.24-.47.38-1 .38-1.56C22 3.57 20.43 2 18.5 2c-.96 0-1.83.39-2.47 1.02C15.4 2.42 14.5 2 13.5 2zM10 7c.55 0 1 .67 1 1.5S10.55 10 10 10s-1-.67-1-1.5S9.45 7 10 7m4 0c.55 0 1 .67 1 1.5s-.45 1.5-1 1.5-1-.67-1-1.5.45-1.5 1-1.5"
                />
              </svg>
            }
          }
          <span class="text-base">{{ primary().label }}</span>
          @if (primary().hint) {
            <span class="text-xs uppercase tracking-wider opacity-70">
              {{ primary().hint }}
            </span>
          }
        </span>
        <kbd
          class="bg-background/20 border-foreground/20 inline-flex h-6 w-6 items-center justify-center rounded-md border font-mono text-xs font-medium"
        >
          ⏎
        </kbd>
      </a>

      <a
        hlmBtn
        variant="outline"
        size="lg"
        [href]="waitlistHref"
        target="_blank"
        rel="noopener noreferrer"
        class="group w-full justify-between py-6"
      >
        <span class="text-base">{{ secondaryLabel() }}</span>
        <ng-icon hlm size="sm" name="lucideArrowRight" class="h-4 w-4" />
      </a>

      @if (os.isMac() || !os.isKnown()) {
        <p class="text-muted-foreground text-sm">
          Mac older than November 2020?
          <a
            [href]="downloads.macIntel"
            class="text-foreground hover:underline"
          >
            Download for Intel-based Macs
          </a>
        </p>
      }
    </div>
  `,
})
export class DownloadDialogComponent {
  protected readonly os = inject(OsService);
  private readonly ref = inject(BrnDialogRef);
  protected readonly downloads = SITE_CONFIG.downloads;
  protected readonly waitlistHref = SITE_CONFIG.downloads.waitlist;

  protected readonly primary = computed<Primary>(() => {
    if (this.os.isMac()) {
      return {
        label: 'Download for Mac',
        hint: this.os.macArch() === 'apple-silicon' ? 'Apple Silicon' : 'Mac',
        href: this.downloads.mac,
        icon: 'apple',
      };
    }
    if (this.os.isWindows()) {
      return {
        label: 'Join Windows waitlist',
        href: this.waitlistHref,
        target: '_blank',
        icon: 'windows',
      };
    }
    if (this.os.isLinux()) {
      return {
        label: 'Join Linux waitlist',
        href: this.waitlistHref,
        target: '_blank',
        icon: 'linux',
      };
    }
    // Unknown OS — default to Mac CTA (still our only ready build).
    return {
      label: 'Download for Mac',
      hint: 'Apple Silicon',
      href: this.downloads.mac,
      icon: 'apple',
    };
  });

  protected readonly secondaryLabel = computed(() => {
    if (this.os.isMac()) return 'Join Windows/Linux waitlist';
    if (this.os.isWindows()) return 'Join Mac/Linux waitlist';
    if (this.os.isLinux()) return 'Join Mac/Windows waitlist';
    return 'Join Windows/Linux waitlist';
  });

  @HostListener('document:keydown.enter')
  protected onEnter(): void {
    const p = this.primary();
    if (typeof window === 'undefined') return;
    if (p.target === '_blank') {
      window.open(p.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = p.href;
    }
    this.ref.close();
  }
}
