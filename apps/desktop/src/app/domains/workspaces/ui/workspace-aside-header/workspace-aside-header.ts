import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitBranch, lucideGitCommitVertical } from '@ng-icons/lucide';
import type { OpenInTool } from '../../data/open-in-tools';
import { OpenInMenu } from '../open-in-menu/open-in-menu';

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
  providers: [provideIcons({ lucideGitBranch, lucideGitCommitVertical })],
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
        class="min-w-0 max-w-[140px] gap-1 font-normal"
      >
        <ng-icon hlm name="lucideGitBranch" size="xs" />
        <span class="truncate">{{ branch() || '—' }}</span>
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
        hlmTooltip="Commit changes"
        position="bottom"
        (click)="commit.emit()"
      >
        <ng-icon hlm name="lucideGitCommitVertical" size="xs" />
        <span>Commit</span>
      </button>
    </div>
  `,
})
export class WorkspaceAsideHeader {
  readonly branch = input.required<string>();
  readonly tools = input.required<readonly OpenInTool[]>();
  readonly lastUsedTool = input.required<OpenInTool>();
  readonly workspaceName = input<string>('');

  readonly openIn = output<OpenInTool>();
  readonly commit = output<void>();
}
