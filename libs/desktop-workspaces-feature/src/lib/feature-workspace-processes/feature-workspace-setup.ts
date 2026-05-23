import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideListTree, lucidePlay } from '@ng-icons/lucide';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { RunRegistry } from '@mozart/desktop-runs-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';

// Setup tab — empty-state card with a CTA that runs the configured
// setup command. Pulled out of `feature-workspace-processes` so the
// parent stays a thin tab orchestrator and each tab's content lives
// in its own file. Inputs are intentionally absent — this component
// reads facades directly, like its Run/Terminal siblings.
@Component({
  selector: 'app-feature-workspace-setup',
  imports: [NgIcon, HlmButtonImports, HlmIconImports],
  providers: [provideIcons({ lucideListTree, lucidePlay })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <div
      class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <ng-icon
        hlm
        name="lucideListTree"
        size="md"
        class="text-muted-foreground/60"
      />
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground">Set up your workspace</p>
        <p class="text-xs text-muted-foreground">
          Install dependencies, build the project, or run any setup command
          defined for this workspace.
        </p>
      </div>
      <button
        hlmBtn
        type="button"
        size="sm"
        class="rounded"
        [disabled]="!hasRunCommand() || runStatus() === 'running'"
        (click)="onRunSetup()"
      >
        <ng-icon hlm name="lucidePlay" size="xs" />
        Run setup
      </button>
      @if (!hasRunCommand()) {
        <p class="text-[11px] text-muted-foreground/70">
          No run command configured. Add one in project settings.
        </p>
      }
    </div>
  `,
})
export class FeatureWorkspaceSetup {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly runs = inject(RunRegistry);

  protected readonly runStatus = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  protected readonly hasRunCommand = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return false;
    const ws = this.workspaces.workspaceById(id)();
    if (!ws) return false;
    return !!this.projects.byId(ws.projectId)()?.runCommand;
  });

  protected async onRunSetup(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.start(id);
    } catch (err) {
      console.warn('[ws-setup] run setup failed:', err);
    }
  }
}
