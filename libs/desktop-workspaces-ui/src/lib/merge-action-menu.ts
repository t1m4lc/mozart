import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideGitMerge,
  lucideGitPullRequest,
} from '@ng-icons/lucide';
import type { MergeAction } from '@mozart/desktop-workspaces-util';

// P2.6.C — split-button + dropdown for the merge action on the right-
// aside header. Primary label routes off AD-02:
//
//   workspace.last_merge_action
//   ?? project_local_config.merge_mode
//   ?? auto-detect from remote
//
// "Create PR" stays clickable even when GitHub isn't connected or the
// remote isn't GitHub — the dialog (FeatureCreatePrDialog) shows a
// state-explaining alert and gates Submit instead. Tooltips here stay
// informational so a user hovering knows the dialog will explain.
// "Merge now" is still gated behind `localMergeDisabled` (P1.1 D5)
// until the flow ships.
@Component({
  selector: 'app-merge-action-menu',
  imports: [
    NgIcon,
    HlmBadgeImports,
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
          [disabled]="prRowDisabled()"
          [hlmTooltip]="prRowTooltip()"
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
          [disabled]="localMergeDisabled()"
          [hlmTooltip]="localMergeDisabled() ? 'Coming soon' : null"
          position="left"
          (triggered)="onPick('local')"
        >
          <ng-icon hlm name="lucideGitMerge" size="xs" />
          <span class="flex-1">Merge now</span>
          @if (localMergeDisabled()) {
            <span hlmBadge variant="secondary" class="font-normal">Soon</span>
          }
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class MergeActionMenu {
  /** Routed primary action: `'pr'` or `'local'`. The parent resolves
   *  workspace.lastMergeAction → project.mergeMode → default. */
  readonly primaryAction = input.required<MergeAction>();
  /** Whether the user has a stored GitHub auth session (ProfileFacade). */
  readonly githubConnected = input.required<boolean>();
  /** P1.1 D9 — whether the active project's `origin` remote resolves
   *  to a github.com URL. The parent (shell-right) loads this lazily
   *  via `ProjectsFacade.ensureIsGithubRemote`; until the probe lands
   *  the parent passes `false` (defensive — better to gate than to
   *  surface a misleading enabled button). */
  readonly isGithubRemote = input.required<boolean>();
  /** P1.1 D5 — temporary policy: local-merge is hidden behind a Soon
   *  badge until the flow is finished. Defaults to `true` so any
   *  surface that mounts the menu without opting in stays safe; T5
   *  passes `true` explicitly from shell-right. Flip to `false` when
   *  the local-merge feature is ready to ship. */
  readonly localMergeDisabled = input<boolean>(true);

  readonly pick = output<MergeAction>();

  protected readonly primaryDisabled = computed(() => {
    if (this.primaryAction() === 'pr') {
      // PR always clickable — the dialog explains and gates Submit.
      return false;
    }
    // primaryAction === 'local' — mirror the dropdown row's gating so
    // a (primaryAction='local', localMergeDisabled=true) combo can't
    // ship a clickable primary while the dropdown row is disabled.
    return this.localMergeDisabled();
  });

  protected readonly primaryLabel = computed(() =>
    this.primaryAction() === 'pr' ? 'Create PR' : 'Merge now',
  );

  protected readonly primaryIcon = computed(() =>
    this.primaryAction() === 'pr' ? 'lucideGitPullRequest' : 'lucideGitMerge',
  );

  protected readonly primaryTooltip = computed(() => {
    if (this.primaryAction() === 'pr') {
      if (!this.isGithubRemote()) return "This repo isn't on GitHub";
      if (!this.githubConnected()) return 'Connect GitHub to open PRs';
      return 'Open a pull request';
    }
    if (this.localMergeDisabled()) return 'Coming soon';
    return 'Merge this workspace into its base branch';
  });

  // PR row stays clickable; the dialog explains and gates Submit.
  protected readonly prRowDisabled = computed(() => false);

  protected readonly prRowTooltip = computed(() => {
    if (!this.isGithubRemote()) return "This repo isn't on GitHub";
    if (!this.githubConnected()) return 'Connect GitHub to open PRs';
    return null;
  });

  protected primary(): void {
    if (this.primaryDisabled()) return;
    this.pick.emit(this.primaryAction());
  }

  protected onPick(action: MergeAction): void {
    this.pick.emit(action);
  }
}
