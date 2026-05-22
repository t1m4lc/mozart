import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideGitMerge,
  lucideGitPullRequest,
} from '@ng-icons/lucide';
import type { MergeAction } from '../data/workspace.model';

// P2.6.C — split-button + dropdown for the merge action on the right-
// aside header. Primary label routes off AD-02:
//
//   workspace.last_merge_action
//   ?? project_local_config.merge_mode
//   ?? auto-detect from remote
//
// The dropdown ALWAYS shows both options. "Create PR" is disabled (with
// a tooltip) when no GitHub remote is connected, mirroring the existing
// Open-in-IDE last-used pattern.
@Component({
  selector: 'app-merge-action-menu',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideGitMerge,
      lucideGitPullRequest,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex">
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [hlmTooltip]="primaryTooltip()"
        position="bottom"
        class="h-7 rounded-r-none rounded-l-md border-r-0 px-2 text-xs font-normal"
        [disabled]="primaryDisabled()"
        (click)="primary()"
      >
        <ng-icon hlm [name]="primaryIcon()" size="xs" />
        <span>{{ primaryLabel() }}</span>
      </button>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        hlmTooltip="More merge options"
        position="bottom"
        [hlmDropdownMenuTrigger]="menu"
        align="end"
        side="bottom"
        class="h-7 rounded-l-none rounded-r-md px-1.5"
      >
        <ng-icon hlm name="lucideChevronDown" size="xs" />
      </button>
    </div>

    <ng-template #menu>
      <hlm-dropdown-menu>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [disabled]="!githubConnected()"
          [hlmTooltip]="githubConnected() ? null : 'Connect GitHub to open PRs'"
          position="left"
          (triggered)="onPick('pr')"
        >
          <ng-icon hlm name="lucideGitPullRequest" size="xs" />
          <span class="flex-1">Create PR</span>
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="onPick('local')"
        >
          <ng-icon hlm name="lucideGitMerge" size="xs" />
          <span class="flex-1">Merge now</span>
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class MergeActionMenu {
  /** Routed primary action: `'pr'` or `'local'`. The parent resolves
   *  workspace.lastMergeAction → project.mergeMode → default. */
  readonly primaryAction = input.required<MergeAction>();
  /** Required for the PR dropdown row's enabled/tooltip state. */
  readonly githubConnected = input.required<boolean>();

  readonly pick = output<MergeAction>();

  protected readonly primaryDisabled = computed(
    () => this.primaryAction() === 'pr' && !this.githubConnected(),
  );

  protected readonly primaryLabel = computed(() =>
    this.primaryAction() === 'pr' ? 'Create PR' : 'Merge now',
  );

  protected readonly primaryIcon = computed(() =>
    this.primaryAction() === 'pr' ? 'lucideGitPullRequest' : 'lucideGitMerge',
  );

  protected readonly primaryTooltip = computed(() => {
    if (this.primaryAction() === 'pr') {
      return this.githubConnected()
        ? 'Open a pull request'
        : 'Connect GitHub to open PRs';
    }
    return 'Merge this workspace into its base branch';
  });

  protected primary(): void {
    if (this.primaryDisabled()) return;
    this.pick.emit(this.primaryAction());
  }

  protected onPick(action: MergeAction): void {
    this.pick.emit(action);
  }
}
