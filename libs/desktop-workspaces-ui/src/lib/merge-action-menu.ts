import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { MergeAction } from '@mozart/desktop-workspaces-util';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideExternalLink,
  lucideGitMerge,
  lucideGitPullRequest,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';

// P2.6.C — split-button + dropdown for the merge action on the right-
// aside header. Primary label routes off AD-02:
//
//   workspace.last_merge_action
//   ?? project_local_config.merge_mode
//   ?? auto-detect from remote
//
// "Create PR" stays clickable even when GitHub isn't connected or the
// remote isn't GitHub — the dialog (FeatureCreatePrDialog) shows a
// state-explaining alert and gates Submit instead. Once a PR exists
// (`prUrl` set) the PR affordance flips to "View PR" and emits `viewPr`
// to open it in the browser instead of re-opening the create dialog.
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
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideExternalLink,
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
        class="h-7 rounded-r-none rounded-l-md border-r-0 px-2 text-xs font-normal"
        [disabled]="primaryDisabled()"
        (click)="primary()"
      >
        <ng-icon hlm [name]="primaryIcon()" size="sm" />
        <span>{{ primaryLabel() }}</span>
      </button>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [hlmDropdownMenuTrigger]="menu"
        align="end"
        side="bottom"
        class="h-7 rounded-l-none rounded-r-md px-1.5"
      >
        <ng-icon hlm name="lucideChevronDown" size="sm" />
      </button>
    </div>

    <ng-template #menu>
      <hlm-dropdown-menu>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [disabled]="prRowDisabled()"
          (triggered)="onPrRow()"
        >
          <ng-icon hlm [name]="prRowIcon()" size="xs" />
          <span>{{ prRowLabel() }}</span>
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [disabled]="localMergeDisabled()"
          (triggered)="onPick('local')"
        >
          <ng-icon hlm name="lucideGitMerge" size="xs" />
          <span>Merge now</span>
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
   *  via `ProjectsFacade.ensureGithubRemoteStatus`; until the probe lands
   *  the parent passes `false` (defensive — better to gate than to
   *  surface a misleading enabled button). */
  readonly isGithubRemote = input.required<boolean>();
  /** P1.1 D5 — temporary policy: local-merge is hidden behind a Soon
   *  badge until the flow is finished. Defaults to `true` so any
   *  surface that mounts the menu without opting in stays safe; T5
   *  passes `true` explicitly from shell-right. Flip to `false` when
   *  the local-merge feature is ready to ship. */
  readonly localMergeDisabled = input<boolean>(true);
  /** When set, a PR already exists for this workspace: the PR affordance
   *  becomes "View PR" and emits `viewPr` (opens the URL) instead of
   *  routing to the create dialog. `null` = no PR yet. */
  readonly prUrl = input<string | null>(null);

  readonly pick = output<MergeAction>();
  readonly viewPr = output<void>();

  protected readonly hasPr = computed(() => !!this.prUrl());

  protected readonly primaryDisabled = computed(() => {
    if (this.primaryAction() === 'pr') {
      // PR always clickable — the dialog explains and gates Submit, and
      // when a PR exists this is a "View PR" link.
      return false;
    }
    // primaryAction === 'local' — mirror the dropdown row's gating so
    // a (primaryAction='local', localMergeDisabled=true) combo can't
    // ship a clickable primary while the dropdown row is disabled.
    return this.localMergeDisabled();
  });

  protected readonly primaryLabel = computed(() => {
    if (this.primaryAction() !== 'pr') return 'Merge now';
    return this.hasPr() ? 'View PR' : 'Create PR';
  });

  protected readonly primaryIcon = computed(() => {
    if (this.primaryAction() !== 'pr') return 'lucideGitMerge';
    return this.hasPr() ? 'lucideExternalLink' : 'lucideGitPullRequest';
  });

  protected readonly prRowLabel = computed(() =>
    this.hasPr() ? 'View PR' : 'Create PR',
  );
  protected readonly prRowIcon = computed(() =>
    this.hasPr() ? 'lucideExternalLink' : 'lucideGitPullRequest',
  );
  // PR row stays clickable; the dialog explains and gates Submit.
  protected readonly prRowDisabled = computed(() => false);

  protected primary(): void {
    if (this.primaryAction() === 'pr') {
      this.emitPrAction();
      return;
    }
    if (this.primaryDisabled()) return;
    this.pick.emit(this.primaryAction());
  }

  protected onPick(action: MergeAction): void {
    this.pick.emit(action);
  }

  protected onPrRow(): void {
    this.emitPrAction();
  }

  private emitPrAction(): void {
    if (this.hasPr()) this.viewPr.emit();
    else this.pick.emit('pr');
  }
}
