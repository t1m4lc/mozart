import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RepositoriesFacade } from '../data/repositories.facade';
import { DiffView } from '../ui-diff-view/ui-diff-view';

@Component({
  selector: 'app-feature-file-diff',
  imports: [DiffView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <app-diff-view
      class="block h-full w-full"
      [path]="path()"
      [diffText]="diffText()"
      [loading]="loading()"
      [error]="error()"
      (refresh)="reload()"
    />
  `,
})
export class FeatureFileDiff {
  readonly workspaceId = input<string | null>(null);
  readonly path = input<string | null>(null);
  /** Bumped by the parent on FS-watcher pings; triggers a re-fetch
   *  even when workspaceId + path stay the same. */
  readonly refreshTick = input<number>(0);

  private readonly repos = inject(RepositoriesFacade);

  protected readonly diffText = signal<string>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // Tracks the most recent fetch identifier so out-of-order responses
  // (e.g. user clicks foo then bar before foo resolves) don't clobber
  // the visible diff.
  private fetchId = 0;

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      const p = this.path();
      // Subscribe to the tick so cleanup re-runs on watcher pings.
      this.refreshTick();
      if (!id || !p) {
        this.diffText.set('');
        this.error.set(null);
        return;
      }
      void this.fetch(id, p);
    });
  }

  protected reload(): void {
    const id = this.workspaceId();
    const p = this.path();
    if (!id || !p) return;
    void this.fetch(id, p);
  }

  private async fetch(workspaceId: string, path: string): Promise<void> {
    const myId = ++this.fetchId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const text = await this.repos.loadFileDiff(workspaceId, path);
      if (myId !== this.fetchId) return; // stale
      this.diffText.set(text);
    } catch (err) {
      if (myId !== this.fetchId) return;
      this.error.set(err instanceof Error ? err.message : String(err));
      this.diffText.set('');
    } finally {
      if (myId === this.fetchId) {
        this.loading.set(false);
      }
    }
  }
}
