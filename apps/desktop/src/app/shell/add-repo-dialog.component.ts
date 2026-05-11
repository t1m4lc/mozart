/**
 * `AddRepoDialogComponent` — text-input-only "Add repository" dialog
 * (Q4 lock: no folder picker until 1.8c). Submits the absolute path to
 * `ProjectStore.addRepo`, which round-trips through Rust's
 * `add_repo` command, persists the new repo, and selects it.
 *
 * Layout:
 *   - 480 px wide content card with `--bg-card` background,
 *     `--border-focus` ring, `--radius-md` corners.
 *   - Path input with a `[Browse...]` button that is permanently
 *     disabled in 1.8b (tooltip "Coming in 1.8c"). The hlmTooltip is
 *     attached so users can see why it's disabled.
 *   - Fixed `Cancel | Add` button order on every OS (Q5 lock — no
 *     `platform.service.ts`).
 *
 * Closing:
 *   - On success → `BrnDialogRef.close(newRepo)`.
 *   - On `MozartError` → dialog stays open, inline error message.
 *   - On Cancel / Esc / overlay (overlay disabled by service options) →
 *     `BrnDialogRef.close()` with no payload.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@mozart/ui/dialog';
import { HlmInputImports } from '@mozart/ui/input';
import { HlmLabelImports } from '@mozart/ui/label';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

import { MozartError } from '../services/mozart-error';
import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';

@Component({
  selector: 'app-add-repo-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmTooltipImports,
  ],
  template: `
    <div class="dialog-body">
      <hlm-dialog-header>
        <h2 hlmDialogTitle>Add repository</h2>
        <p hlmDialogDescription>
          Pick a local folder with a git repository.
        </p>
      </hlm-dialog-header>

      <form class="form" (submit)="onSubmit($event)" novalidate>
        <label hlmLabel for="add-repo-path">Local folder</label>
        <div class="path-row">
          <input
            hlmInput
            id="add-repo-path"
            name="path"
            type="text"
            placeholder="/home/me/code/my-repo"
            [value]="pathInput()"
            (input)="onPathInput($event)"
            [disabled]="isSubmitting()"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            class="browse-btn"
            disabled
            [hlmTooltip]="'Coming in 1.8c'"
          >
            Browse…
          </button>
        </div>
        @if (errorMsg() !== null) {
          <p class="error-msg" role="alert">{{ errorMsg() }}</p>
        }
      </form>

      <hlm-dialog-footer class="footer">
        <button
          hlmBtn
          variant="ghost"
          type="button"
          (click)="cancel()"
          [disabled]="isSubmitting()"
        >
          Cancel
        </button>
        <button
          hlmBtn
          variant="default"
          type="button"
          class="submit-btn"
          (click)="submit()"
          [disabled]="!canSubmit()"
        >
          @if (isSubmitting()) {
            Adding…
          } @else {
            Add
          }
        </button>
      </hlm-dialog-footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 480px;
      max-width: 90vw;
      padding: 24px;
      background: var(--bg-card, hsl(var(--card)));
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius-md, 6px);
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .path-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .path-row input {
      flex: 1 1 auto;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 13px;
    }
    .path-row input:focus-visible {
      border-color: var(--border-focus, hsl(var(--ring)));
    }
    .browse-btn {
      flex: 0 0 auto;
    }
    .error-msg {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--status-error, hsl(var(--destructive)));
    }
    .footer {
      padding-top: 8px;
      border-top: 1px solid hsl(var(--border));
    }
  `,
})
export class AddRepoDialogComponent {
  // BrnDialogRef is generic; the closing payload is RepoDto on success
  // or `undefined` on cancel. The brain dialog typings default to `any`
  // — we narrow at the call site by inspecting `closed$`.
  private readonly dialogRef =
    inject<BrnDialogRef<RepoDto | undefined>>(BrnDialogRef);
  private readonly projectStore = inject(ProjectStore);

  // Public for the spec — the template reads / writes via the
  // signal-based two-way pattern (`[value]` + `(input)`).
  readonly pathInput = signal('');
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly canSubmit = computed<boolean>(
    () => this.pathInput().trim().length > 0 && !this.isSubmitting(),
  );

  protected onPathInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.pathInput.set(target.value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.isSubmitting.set(true);
    this.errorMsg.set(null);
    try {
      const repo = await this.projectStore.addRepo(this.pathInput().trim());
      this.dialogRef.close(repo);
    } catch (err) {
      const message =
        err instanceof MozartError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to add repository.';
      this.errorMsg.set(message);
      this.isSubmitting.set(false);
    }
  }
}
