import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { MessageList } from '@mozart/desktop-chat-ui';
import { TimelinePrefsService } from '@mozart/desktop-ui-state-data-access';
import {
  FileTabsService,
  WorkspacesFacade,
} from '@mozart/desktop-workspaces-data-access';
import type { TurnFileChipEvent } from '@mozart-ui/timeline';

/**
 * Chat-only content for the middle shell — owns the message-list /
 * empty-state switch. Projected into `FeatureChatScrollSurface`'s
 * default slot; that surface owns chat scroll behavior. The composer
 * (FeatureWorkspaceComposer) lives outside both, always mounted at
 * WorkspaceTabContent's bottom regardless of which content sits in
 * the chat surface — that's the P2.2 file-tab visibility design.
 *
 * Owns no scroll API. FeatureChatScrollSurface drives chat scroll
 * against the shell's `<main>` overflow surface, using
 * ScrollPositionService for per-tab persistence and per-chat
 * attach/detach mode.
 *
 * Empty state is projected via the default `<ng-content>` — keeps the
 * variant/copy decisions in the parent page rather than coupling this
 * component to workspace facades.
 *
 * This feature wrapper is also the gateway for cross-domain wiring the
 * dumb chat-ui layer can't do itself:
 *   - reads `TimelinePrefsService.density()` and passes it down to
 *     MessageList → AgentMessage → TurnContainer ;
 *   - resolves `(fileChipClick)` against the active workspace +
 *     project, then calls `FileTabsService.navigateToFileTab` so the
 *     click opens the path in the Files tab in diff mode.
 */
@Component({
  selector: 'app-feature-chat-content',
  imports: [MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    @if (messages().length > 0) {
      <app-message-list
        [messages]="messages()"
        [density]="density()"
        (fileChipClick)="onFileChipClick($event)"
      />
    } @else {
      <ng-content />
    }
  `,
})
export class FeatureChatContent {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly fileTabs = inject(FileTabsService);
  private readonly timelinePrefs = inject(TimelinePrefsService);

  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );

  protected readonly density = this.timelinePrefs.density;

  protected onFileChipClick(event: TurnFileChipEvent): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    const workspace = this.workspaces.workspaceById(workspaceId)();
    if (!workspace) return;
    void this.fileTabs.navigateToFileTab({
      projectId: workspace.projectId,
      workspaceId,
      path: event.path,
      intent: 'pin',
      mode: 'diff',
      source: 'changes',
    });
  }
}
