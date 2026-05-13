import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  input,
  output,
} from '@angular/core';
import { HlmBreadcrumbImports } from '@mozart/ui/breadcrumb';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitBranch, lucidePanelRight } from '@ng-icons/lucide';
import type { OpenInTool } from '../../data/open-in-tools';
import { BranchPicker } from '../branch-picker/branch-picker';
import { OpenInMenu } from '../open-in-menu/open-in-menu';

@Component({
  selector: 'app-workspace-toolbar',
  imports: [
    NgIcon,
    NgTemplateOutlet,
    BranchPicker,
    OpenInMenu,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideGitBranch, lucidePanelRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      data-tauri-drag-region
      class="flex h-9 items-center gap-1 border-b border-sidebar-border bg-sidebar px-1"
    >
      @if (leadingSlot()) {
        <ng-container [ngTemplateOutlet]="leadingSlot()!" />
      }

      <div class="flex min-w-0 flex-1 items-center gap-1 px-1">
        <nav hlmBreadcrumb aria-label="Workspace" class="min-w-0 overflow-hidden">
          <ol hlmBreadcrumbList>
            <li hlmBreadcrumbItem class="shrink-0">
              <span
                hlmBreadcrumbPage
                class="flex items-center gap-1 text-sm font-normal"
              >
                <span>{{ projectIcon() }}</span>
                <span>{{ projectTitle() }}</span>
              </span>
            </li>
            <li hlmBreadcrumbSeparator class="shrink-0 flex items-center"></li>
            <li hlmBreadcrumbItem class="min-w-0 overflow-hidden">
              <span
                hlmBreadcrumbPage
                class="flex min-w-0 items-center gap-1 text-sm font-normal"
              >
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ workspaceTitle() }}</span>
              </span>
            </li>
          </ol>
        </nav>

        <app-branch-picker
          [value]="targetBranch()"
          [branches]="selectableBranches()"
          (valueChange)="targetBranchChange.emit($event)"
        />
      </div>

      <div
        class="flex shrink-0 items-center gap-1"
        data-tauri-drag-region="false"
      >
        <app-open-in-menu
          [tools]="tools()"
          [lastUsed]="lastUsedTool()"
          [subtitle]="workspaceTitle()"
          (openIn)="openIn.emit($event)"
        />

        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          hlmTooltip="Toggle right sidebar"
          position="bottom"
          class="size-7 rounded-md text-muted-foreground"
          data-tauri-drag-region="false"
          (click)="
            toggleRightPanel.emit();
            $any($event.currentTarget).blur()
          "
        >
          <ng-icon hlm name="lucidePanelRight" size="xs" />
        </button>
      </div>
    </div>
  `,
})
export class WorkspaceToolbar {
  readonly projectIcon = input.required<string | null>();
  readonly projectTitle = input.required<string>();
  readonly workspaceTitle = input.required<string>();
  readonly targetBranch = input.required<string>();
  readonly selectableBranches = input.required<readonly string[]>();
  readonly tools = input.required<readonly OpenInTool[]>();
  readonly lastUsedTool = input.required<OpenInTool>();
  // When set, rendered before the breadcrumb (used to inject window controls
  // + sidebar toggle when the left panel is collapsed).
  readonly leadingSlot = input<TemplateRef<unknown> | null>(null);

  readonly targetBranchChange = output<string>();
  readonly openIn = output<OpenInTool>();
  readonly toggleRightPanel = output<void>();
}
