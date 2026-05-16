import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HlmAlertImports } from '@mozart/ui/alert';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmInputImports } from '@mozart/ui/input';
import { HlmLabelImports } from '@mozart/ui/label';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { ProfileFacade } from './data/profile.facade';

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
    HlmInputImports,
    HlmLabelImports,
    HlmAlertImports,
    HlmSpinnerImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Connect to Claude</h3>
      <p hlmDialogDescription>Paste your Anthropic API key.</p>
    </div>
    <form
      class="space-y-3 px-6"
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
      <!-- Submit button kept inside the form so Enter triggers submit().
           Visible action lives in the dialog footer. -->
      <button type="submit" class="hidden" aria-hidden="true"></button>
    </form>
    <div hlmDialogFooter class="mt-2">
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
          <hlm-spinner aria-label="Saving" />
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
