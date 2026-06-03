import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HlmAlertImports } from '@spartan-ui/alert';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { HlmLabelImports } from '@spartan-ui/label';
import { MzLoader } from '@mozart-ui/loader';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';

// Connect-to-Claude dialog. Probe-before-persist: the backend only writes
// to the OS keyring when the probe returns `connected`. On `invalid` /
// `network_error` the key never touches disk and the dialog stays open
// with a fixed-copy alert (no underlying error string surfaced).
//
// Key handling invariants:
//  - The pasted value lives in a single signal, dropped when the dialog
//    closes (component is destroyed).
//  - Never re-rendered, never echoed, never put into an error string.
//  - The catch arm shows a fixed message — the wrapped Error.message
//    (which carries the AppError.kind) is intentionally discarded.
@Component({
  selector: 'app-ui-connect-dialog',
  imports: [
    HlmDialogImports,
    HlmButtonImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmAlertImports,
    MzLoader,
    NgIcon,
  ],
  providers: [provideIcons({ lucideLock })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Connect to Claude</h3>
      <p hlmDialogDescription>Paste your Anthropic API key.</p>
    </div>
    <form
      class="px-6 py-4 space-y-4"
      (submit)="onFormSubmit($event)"
      autocomplete="off"
    >
      <div class="space-y-1.5">
        <label hlmLabel for="anthropic-key">API key</label>
        <input
          hlmInput
          type="password"
          id="anthropic-key"
          name="key"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="off"
          #focusInput
          [value]="keyDraft()"
          (input)="onKeyInput($event)"
          [disabled]="checking()"
        />
      </div>
      @if (error()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertDescription>{{ error() }}</p>
        </div>
      }
      <p
        class="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <ng-icon hlm name="lucideLock" size="xs" />
        <span>Your token is stored locally on this device, in your OS keychain.</span>
      </p>
      <!-- Submit button kept inside the form so Enter triggers submit().
           Visible action lives in the dialog footer. -->
      <button type="submit" class="hidden" aria-hidden="true"></button>
    </form>
    <div hlmDialogFooter class="px-6 py-4">
      <button
        hlmDialogClose
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="checking()"
      >
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        (click)="submit()"
        [disabled]="checking() || !keyDraft()"
      >
        @if (checking()) {
          <mz-loader variant="simple" size="sm" aria-label="Saving" />
        } @else {
          Save
        }
      </button>
    </div>
  `,
})
export class UiConnectDialog {
  private readonly facade = inject(ProfileFacade);
  private readonly ref = inject(BrnDialogRef);
  private readonly focusInput =
    viewChild<ElementRef<HTMLInputElement>>('focusInput');

  protected readonly keyDraft = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly checking = signal(false);

  constructor() {
    afterNextRender(() => this.focusInput()?.nativeElement.focus());
  }

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }

  protected onFormSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  protected async submit(): Promise<void> {
    const key = this.keyDraft();
    if (this.checking() || !key) return;
    this.checking.set(true);
    this.error.set(null);
    try {
      const result = await this.facade.connectWithKey(key);
      if (result === 'connected') {
        this.ref.close();
        return;
      }
      this.error.set(
        result === 'invalid'
          ? 'The key was rejected. Check it and try again.'
          : 'Could not reach Anthropic. Check your network and try again.',
      );
    } catch {
      // Fixed copy — the wrapped Error.message carries AppError.kind
      // ("io"), not the key, but we keep the surface narrow on purpose.
      // The OS keyring is the only failure source `connect` can throw on.
      this.error.set('Could not store the key on this device.');
    } finally {
      this.checking.set(false);
    }
  }
}
