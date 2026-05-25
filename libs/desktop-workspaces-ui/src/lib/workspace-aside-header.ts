import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type { OpenInTool } from '@mozart/desktop-workspaces-util';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideGitBranch,
  lucideGitCommitVertical,
  lucideGitPullRequest,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { OpenInMenu } from './open-in-menu';

@Component({
  selector: 'app-workspace-aside-header',
  imports: [
    NgIcon,
    OpenInMenu,
    HlmBadgeImports,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideGitBranch,
      lucideGitCommitVertical,
      lucideGitPullRequest,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex h-9 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2"
    >
      <span
        hlmBadge
        variant="secondary"
        hlmTooltip="Branch for this workspace"
        position="bottom"
        class="min-w-0 max-w-35 gap-1 font-normal"
      >
        <ng-icon hlm name="lucideGitBranch" size="xs" />
        <span class="truncate font-mono">{{ branch() || '—' }}</span>
      </span>

      <span class="flex-1"></span>

      <app-open-in-menu
        [tools]="tools()"
        [lastUsed]="lastUsedTool()"
        [subtitle]="workspaceName()"
        (openIn)="openIn.emit($event)"
      />

      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        class="h-7 px-2 text-xs font-normal text-muted-foreground"
        position="bottom"
        (click)="commit.emit()"
      >
        <ng-icon hlm name="lucideGitCommitVertical" size="xs" />
        <span>Commit</span>
      </button>

      @if (githubConnected()) {
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs font-normal text-muted-foreground"
          hlmTooltip="Open a pull request"
          position="bottom"
          (click)="createPr.emit()"
        >
          <ng-icon hlm name="lucideGitPullRequest" size="xs" />
          <span>PR</span>
        </button>
      }
    </div>
  `,
})
export class WorkspaceAsideHeader {
  readonly branch = input.required<string>();
  readonly tools = input.required<readonly OpenInTool[]>();
  readonly lastUsedTool = input.required<OpenInTool>();
  readonly workspaceName = input<string>('');
  readonly githubConnected = input<boolean>(false);

  readonly openIn = output<OpenInTool>();
  readonly commit = output<void>();
  readonly createPr = output<void>();
}
