import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';

// Dumb 🔒 disclosure card surfaced next to the LLM-provider step.
// Mirrors the copy in onboarding-and-auth.md §6.3.
@Component({
  selector: 'app-ui-disclosure-card',
  imports: [NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideLock })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex items-start gap-3 rounded-md border border-muted bg-muted/30 px-4 py-3 text-sm"
    >
      <ng-icon hlm name="lucideLock" size="sm" class="mt-0.5 shrink-0" />
      <div class="space-y-1">
        <p class="font-medium">Your keys never leave this computer.</p>
        <p class="text-xs text-muted-foreground">
          Mozart stores them in the OS keychain. They're not synced to our
          servers, not in the local database, and not in any log or crash
          report.
        </p>
      </div>
    </div>
  `,
})
export class UiDisclosureCard {}
