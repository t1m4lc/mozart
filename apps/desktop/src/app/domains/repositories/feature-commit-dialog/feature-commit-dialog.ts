import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmInputImports } from '@mozart/ui/input';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitCommitVertical } from '@ng-icons/lucide';
import { RepositoriesFacade } from '../data/repositories.facade';
import type { ChangedFile } from '../data/repositories.adapter';

export interface CommitDialogContext {
  readonly workspaceId: string;
  /** Optional callback fired with the new commit's sha. */
  readonly onCommitted?: (sha: string) => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; files: readonly ChangedFile[] }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-feature-commit-dialog',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
  ],
  providers: [provideIcons({ lucideGitCommitVertical })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle class="flex items-center gap-2">
        <ng-icon hlm name="lucideGitCommitVertical" size="sm" />
        Commit changes
      </h3>
    </div>

    <div class="px-6 pb-2">
      @switch (state().kind) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">Loading changes…</p>
        }
        @case ('error') {
          <p class="text-sm text-destructive">
            {{ asError(state()).message }}
          </p>
        }
        @case ('loaded') {
          @if (asLoaded(state()).files.length === 0) {
            <p class="text-sm text-muted-foreground">No changes to commit.</p>
          } @else {
            <div class="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span
                >{{ selectedCount() }} of
                {{ asLoaded(state()).files.length }} selected</span
              >
              <button
                hlmBtn
                variant="ghost"
                size="xs"
                type="button"
                class="h-6 px-2 text-[11px]"
                (click)="toggleAll()"
              >
                {{ allSelected() ? 'Deselect all' : 'Select all' }}
              </button>
            </div>
            <ul
              class="max-h-48 overflow-auto rounded border border-border bg-background"
            >
              @for (file of asLoaded(state()).files; track file.path) {
                <li>
                  <label
                    class="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      [checked]="isSelected(file.path)"
                      (change)="toggleSelection(file.path)"
                      class="h-3 w-3 cursor-pointer"
                    />
                    <span
                      class="inline-block w-4 text-center font-mono text-[10px]"
                      [class.text-green-600]="file.status === 'added'"
                      [class.text-yellow-600]="file.status === 'modified'"
                      [class.text-red-600]="file.status === 'deleted'"
                      >{{ statusLetter(file.status) }}</span
                    >
                    <span class="min-w-0 flex-1 truncate font-mono">{{ file.path }}</span>
                  </label>
                </li>
              }
            </ul>
          }
        }
      }
    </div>

    <div class="px-6 pb-2">
      <label
        for="commit-message"
        class="mb-1 block text-xs font-medium text-muted-foreground"
        >Commit message</label
      >
      <textarea
        id="commit-message"
        hlmInput
        rows="3"
        class="w-full resize-y font-mono text-sm"
        placeholder="Describe the change…"
        [value]="message()"
        (input)="onMessageInput($event)"
      ></textarea>
    </div>

    @if (commitError(); as err) {
      <p class="px-6 pb-2 text-xs text-destructive">{{ err }}</p>
    }

    <div hlmDialogFooter class="mt-2">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="!canCommit()"
        (click)="onCommit()"
      >
        @if (committing()) {
          Committing…
        } @else {
          Commit
        }
      </button>
    </div>
  `,
})
export class FeatureCommitDialog {
  protected readonly ctx = injectBrnDialogContext<CommitDialogContext>();
  private readonly ref = inject(BrnDialogRef);
  private readonly repos = inject(RepositoriesFacade);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal('');
  protected readonly committing = signal(false);
  protected readonly commitError = signal<string | null>(null);

  protected readonly selectedCount = computed(() => this.selected().size);

  protected readonly allSelected = computed(() => {
    const s = this.state();
    if (s.kind !== 'loaded') return false;
    return (
      s.files.length > 0 && s.files.every((f) => this.selected().has(f.path))
    );
  });

  protected readonly canCommit = computed(() => {
    if (this.committing()) return false;
    if (!this.message().trim()) return false;
    return this.selected().size > 0;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const files = await this.repos.listChangedFiles(this.ctx.workspaceId);
      this.state.set({ kind: 'loaded', files });
      this.selected.set(new Set(files.map((f) => f.path)));
    } catch (err) {
      this.state.set({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  protected isSelected(path: string): boolean {
    return this.selected().has(path);
  }

  protected toggleSelection(path: string): void {
    const next = new Set(this.selected());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    const s = this.state();
    if (s.kind !== 'loaded') return;
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(s.files.map((f) => f.path)));
    }
  }

  protected onMessageInput(event: Event): void {
    this.message.set((event.target as HTMLTextAreaElement).value);
  }

  protected statusLetter(status: ChangedFile['status']): string {
    switch (status) {
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      default:
        return 'M';
    }
  }

  protected asLoaded(s: LoadState): { kind: 'loaded'; files: readonly ChangedFile[] } {
    return s as { kind: 'loaded'; files: readonly ChangedFile[] };
  }
  protected asError(s: LoadState): { kind: 'error'; message: string } {
    return s as { kind: 'error'; message: string };
  }

  protected async onCommit(): Promise<void> {
    if (!this.canCommit()) return;
    this.committing.set(true);
    this.commitError.set(null);
    try {
      const sha = await this.repos.commitWorkspace(
        this.ctx.workspaceId,
        Array.from(this.selected()),
        this.message().trim(),
      );
      this.ctx.onCommitted?.(sha);
      this.ref.close();
    } catch (err) {
      this.commitError.set(err instanceof Error ? err.message : String(err));
      this.committing.set(false);
    }
  }
}
