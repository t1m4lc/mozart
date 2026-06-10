import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideCircleQuestionMark,
  lucideMail,
  lucideMessageSquare,
  lucideRotateCw,
  lucideSparkles,
  lucideUsers,
} from '@ng-icons/lucide';
import { MOZART_LINKS } from '@mozart/shared-util-mozart-links';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { UpdaterService } from './updater.service';

// Footer "Help" affordance shared by the workspace and settings
// sidenavs. Wraps the icon button + dropdown so both shells consume one
// component (single source of menu items, single click handler). Links
// flow through ExternalLinkService → Tauri shell.open so they land in
// the user's default browser instead of inside the Tauri window.
//
// Also doubles as the auto-update surface: when UpdaterService has a
// version ready to install, a pulsing dot decorates the help icon and
// a "Mozart vX.Y.Z ready" section appears at the top of the dropdown
// with Restart now + What's new actions. Discreet on purpose — no
// blocking modal, no floating banner.
@Component({
  selector: 'app-shell-help-menu',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideCircleQuestionMark,
      lucideMail,
      lucideMessageSquare,
      lucideRotateCw,
      lucideSparkles,
      lucideUsers,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon-xs"
      type="button"
      aria-label="Help"
      class="relative size-7 rounded-md text-muted-foreground"
      [hlmTooltip]="updater.updateReady() ? 'Update ready' : 'Help'"
      position="top"
      [hlmDropdownMenuTrigger]="menu"
      align="end"
      side="top"
    >
      <ng-icon hlm name="lucideCircleQuestionMark" size="sm" />
      @if (updater.updateReady()) {
        <span
          aria-hidden="true"
          class="pointer-events-none absolute right-0.5 top-0.5 flex size-2"
        >
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75"
          ></span>
          <span
            class="relative inline-flex size-2 rounded-full bg-violet-500"
          ></span>
        </span>
      }
    </button>

    <ng-template #menu>
      <hlm-dropdown-menu class="w-56">
        @if (updater.updateReady(); as ready) {
          <div
            class="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground"
          >
            Mozart {{ ready.version }} ready
          </div>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="restartUpdate()"
          >
            <ng-icon hlm name="lucideRotateCw" size="xs" />
            Restart now
          </button>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="openReleaseNotes(ready.version)"
          >
            <ng-icon hlm name="lucideSparkles" size="xs" />
            What's new
          </button>
          <hlm-dropdown-menu-separator />
        }
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [hlmDropdownMenuTrigger]="feedbackSub"
          align="start"
          side="right"
        >
          <ng-icon hlm name="lucideMessageSquare" size="xs" />
          Give us feedback
          <hlm-dropdown-menu-item-sub-indicator />
        </button>
        <hlm-dropdown-menu-separator />
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="open(links.docs)"
        >
          <ng-icon hlm name="lucideBookOpen" size="xs" />
          Docs
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="open(links.community.discordInvite)"
        >
          <ng-icon hlm name="lucideUsers" size="xs" />
          Beta tester community
        </button>
        @if (updater.currentVersion(); as version) {
          <hlm-dropdown-menu-separator />
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer text-xs text-muted-foreground"
            (triggered)="open(links.changelog)"
          >
            v{{ version }} · Changelog
          </button>
        }
      </hlm-dropdown-menu>
    </ng-template>

    <ng-template #feedbackSub>
      <hlm-dropdown-menu-sub class="w-48">
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openEmail()"
        >
          <ng-icon hlm name="lucideMail" size="xs" />
          Email
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="open(links.community.discordFeedbackChannel)"
        >
          <ng-icon hlm name="lucideMessageSquare" size="xs" />
          Discord
        </button>
      </hlm-dropdown-menu-sub>
    </ng-template>
  `,
})
export class ShellHelpMenu {
  private readonly externalLink = inject(ExternalLinkService);
  protected readonly updater = inject(UpdaterService);
  protected readonly links = MOZART_LINKS;

  protected open(url: string): void {
    void this.externalLink.openExternal(url).catch((err) => {
      console.warn('[help-menu] openExternal failed:', err);
    });
  }

  protected openEmail(): void {
    const subject = encodeURIComponent('Mozart feedback');
    this.open(`mailto:${this.links.contact.feedbackEmail}?subject=${subject}`);
  }

  protected restartUpdate(): void {
    void this.updater.restart();
  }

  protected openReleaseNotes(version: string): void {
    // Matches the AnalogJS file naming convention
    // apps/landing/src/content/changelog/v<slug>.md, where the slug
    // is the version with dots replaced by hyphens, prefixed with `v`.
    const slug = `v${version.replace(/\./g, '-')}`;
    this.open(`${this.links.changelog}/${slug}`);
  }
}
