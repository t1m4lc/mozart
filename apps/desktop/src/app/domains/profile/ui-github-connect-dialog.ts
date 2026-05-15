import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmInputImports } from '@mozart/ui/input';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { ProfileFacade } from './data/profile.facade';

@Component({
  selector: 'app-ui-github-connect-dialog',
  imports: [HlmButtonImports, HlmDialogImports, HlmInputImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Connect GitHub</h3>
    </div>
    <p hlmDialogDescription class="text-sm text-muted-foreground px-6">
      Paste a personal access token (classic, with
      <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">repo</code>
      scope, or fine-grained with Pull-requests + Contents write).
      Mozart stores the token in your OS keychain.
    </p>

    <div class="px-6 pb-2">
      <input
        type="password"
        hlmInput
        class="w-full font-mono text-sm"
        placeholder="ghp_…"
        autocomplete="off"
        spellcheck="false"
        [value]="token()"
        (input)="onTokenInput($event)"
        (keydown.enter)="onConnect()"
      />
      @if (error(); as err) {
        <p class="mt-2 text-xs text-destructive">{{ err }}</p>
      }
    </div>

    <div hlmDialogFooter class="mt-2">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="!canConnect()"
        (click)="onConnect()"
      >
        @if (busy()) {
          Verifying…
        } @else {
          Connect
        }
      </button>
    </div>
  `,
})
export class UiGithubConnectDialog {
  private readonly ref = inject(BrnDialogRef);
  private readonly facade = inject(ProfileFacade);

  protected readonly token = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  protected canConnect(): boolean {
    return !this.busy() && this.token().trim().length > 0;
  }

  protected async onConnect(): Promise<void> {
    if (!this.canConnect()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const outcome = await this.facade.connectGithub(this.token().trim());
      if (outcome.kind === 'ok') {
        this.ref.close();
        return;
      }
      if (outcome.kind === 'unauthorized') {
        this.error.set('Token rejected by GitHub. Check the scopes and try again.');
      } else {
        this.error.set(`Network error: ${outcome.message}`);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
