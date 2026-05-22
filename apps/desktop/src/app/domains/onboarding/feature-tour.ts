import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  HlmHighlightOverlay,
  type HighlightStep,
} from '@mozart-ui/highlight-overlay';
import { UiTourClosingCard } from './ui-tour-closing-card';

const TOUR_STEPS: readonly HighlightStep[] = [
  {
    targetSelector: '[data-tour="sidebar-projects-group"]',
    title: 'Your projects live here',
    description:
      "We've added a 'Get started' project so you can play. Each row in this group is a repository Mozart manages.",
    position: 'right',
  },
  {
    targetSelector: '[data-tour="workspace-row-active"]',
    title: 'Workspaces are isolated sandboxes',
    description:
      'Each project gets workspaces — branches with their own diff. Mozart created one for you, ready to use.',
    position: 'right',
  },
  {
    targetSelector: '[data-tour="composer-mode"]',
    title: 'Pick a mode before sending',
    description:
      "Agent edits files. Plan drafts before acting. Ask chats without changes. You'll see the mode picker on the composer.",
    position: 'top',
  },
  {
    targetSelector: '[data-tour="aside-files-tab"]',
    title: 'The Files tab shows agent edits',
    description:
      "When the agent edits files, you'll see the changes here in real time, with diffs against the base branch.",
    position: 'left',
  },
  {
    targetSelector: '[data-tour="aside-header-buttons"]',
    title: 'Open in IDE, commit, ship a PR',
    description:
      'Open the workspace in your favorite editor for bigger changes, then commit and ship a Pull Request — all from Mozart.',
    position: 'bottom',
  },
] as const;

// Phase 6 / Atom 7 — feature wrapper around HlmHighlightOverlay that
// drives the 5-step tour. The targetSelector lookup happens inside
// HlmHighlightOverlay against `document` ; this component just owns
// the step array + cursor.
//
// Mounted by the /tour page on top of the live workspace UI. Skip /
// Esc / Finish all navigate back to `/`.
@Component({
  selector: 'app-feature-tour',
  imports: [HlmHighlightOverlay, UiTourClosingCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (_showClosingCard()) {
      @defer (on immediate) {
        <app-ui-tour-closing-card (done)="onDone()" />
      }
    } @else {
      <mz-highlight-overlay
        [steps]="_steps"
        [currentIndex]="_currentIndex()"
        (advance)="onAdvance()"
        (skip)="onSkip()"
        (complete)="onComplete()"
      />
    }
  `,
})
export class FeatureTour {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly _steps = TOUR_STEPS;
  protected readonly _currentIndex = signal<number>(0);
  protected readonly _showClosingCard = signal<boolean>(false);

  protected readonly _totalSteps = computed(() => this._steps.length);

  protected onAdvance(): void {
    this._currentIndex.update((i) =>
      Math.min(i + 1, this._steps.length - 1),
    );
  }

  protected onSkip(): void {
    this.dismissTour();
  }

  protected onComplete(): void {
    this._showClosingCard.set(true);
  }

  protected onDone(): void {
    this.dismissTour();
  }

  /** Strip the `tour=on` query param so the AppShell unmounts the
   *  overlay. The user stays on the current workspace ; no navigation
   *  away from `/project/:projectId/workspace/:workspaceId`. */
  private dismissTour(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tour: null },
      queryParamsHandling: 'merge',
    });
  }
}
