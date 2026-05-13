import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';

// Help dialog opened by the (?) icon on the connection card. Explains
// the two paths Mozart supports for talking to Claude. Pure content —
// no facade, no state.
@Component({
  selector: 'app-ui-connection-help-dialog',
  imports: [HlmDialogImports, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>How Mozart connects to Anthropic</h3>
    </div>
    <div class="space-y-4 px-6 text-sm text-muted-foreground">
      <div class="space-y-1">
        <p class="font-medium text-foreground">
          Already signed in with
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            claude /login
          </code>
          ?
        </p>
        <p>
          Mozart spawns the Claude Code CLI for every agent run and lets
          it use the session you're already signed in to — typical for
          Claude Pro and Max subscribers. Click <b>Connect</b> and
          Mozart will detect it automatically. Nothing else to do.
        </p>
      </div>
      <div class="space-y-1">
        <p class="font-medium text-foreground">Prefer an API key?</p>
        <p>
          If you don't use
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            claude /login
          </code>
          — for example, when billing per-request through the Anthropic
          API — paste your key and Mozart will store it encrypted in
          your OS keyring (macOS Keychain, Linux Secret Service, Windows
          Credential Manager).
        </p>
      </div>
    </div>
    <div hlmDialogFooter class="mt-2">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Got it
      </button>
    </div>
  `,
})
export class UiConnectionHelpDialog {}
