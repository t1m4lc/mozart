import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideCircleQuestionMark,
  lucideMail,
  lucideMessageSquare,
  lucideUsers,
} from '@ng-icons/lucide';
import { MOZART_LINKS } from '@mozart/shared-util-mozart-links';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';

// Footer "Help" affordance shared by the workspace and settings
// sidenavs. Wraps the icon button + dropdown so both shells consume one
// component (single source of menu items, single click handler). Links
// flow through ExternalLinkService → Tauri shell.open so they land in
// the user's default browser instead of inside the Tauri window.
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
      class="size-7 rounded-md text-muted-foreground"
      hlmTooltip="Help"
      position="top"
      [hlmDropdownMenuTrigger]="menu"
      align="end"
      side="top"
    >
      <ng-icon hlm name="lucideCircleQuestionMark" size="sm" />
    </button>

    <ng-template #menu>
      <hlm-dropdown-menu class="w-56">
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
}
