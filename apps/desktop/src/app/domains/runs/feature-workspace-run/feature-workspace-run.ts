import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleStop,
  lucidePencil,
  lucidePlay,
} from '@ng-icons/lucide';
import { ProjectsFacade } from '../../projects';
import { WorkspacesFacade } from '../../workspaces';
import { RunRegistry } from '../data/run-registry.service';
import type { RunStatus } from '../data/run-status.model';

@Component({
  selector: 'app-feature-workspace-run',
  imports: [
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePlay, lucideCircleStop, lucidePencil })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <div
      class="flex h-8 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
    >
      <span
        hlmBadge
        [variant]="badgeVariant()"
        class="h-4 px-1.5 py-0 text-[10px] font-medium leading-none"
      >{{ statusLabel() }}</span>
      <span
        class="ml-2 truncate text-[11px] text-muted-foreground"
        [title]="commandText() ?? ''"
      >{{ commandText() ?? 'No run command set.' }}</span>
      <span class="flex-1"></span>
      @if (status() === 'running') {
        <button
          hlmBtn
          variant="destructive"
          size="xs"
          type="button"
          class="h-6 px-2 text-[11px]"
          (click)="onStop()"
          hlmTooltip="Stop the run"
          position="left"
        >
          <ng-icon hlm name="lucideCircleStop" size="xs" />
          Stop
        </button>
      } @else {
        <button
          hlmBtn
          variant="default"
          size="xs"
          type="button"
          class="h-6 px-2 text-[11px]"
          [disabled]="!commandText()"
          (click)="onRun()"
          hlmTooltip="Run the configured command"
          position="left"
        >
          <ng-icon hlm name="lucidePlay" size="xs" />
          Run
        </button>
      }
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="size-6 text-muted-foreground"
        hlmTooltip="Edit run command"
        position="left"
        (click)="toggleEdit()"
      >
        <ng-icon hlm name="lucidePencil" size="xs" />
      </button>
    </div>

    @if (editing()) {
      <form
        class="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-2 py-1"
        (submit)="onSave($event)"
      >
        <input
          #cmdInput
          type="text"
          class="min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
          [value]="commandText() ?? ''"
          placeholder="e.g. pnpm dev"
          name="run-command"
        />
        <button
          hlmBtn
          variant="default"
          size="xs"
          type="submit"
          class="h-6 px-2 text-[11px]"
        >Save</button>
        <button
          hlmBtn
          variant="ghost"
          size="xs"
          type="button"
          class="h-6 px-2 text-[11px]"
          (click)="cancelEdit()"
        >Cancel</button>
      </form>
    }

    <div
      #host
      class="min-h-0 flex-1 overflow-hidden p-1"
      [class.opacity-50]="!commandText()"
    ></div>
  `,
})
export class FeatureWorkspaceRun {
  readonly workspaceId = input<string | null>(null);
  /** True when the Run tab is the active tab — defers xterm attach to
   *  avoid sizing against a hidden host. */
  readonly active = input<boolean>(false);

  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly registry = inject(RunRegistry);
  private readonly projects = inject(ProjectsFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editing = signal(false);

  /** Resolves the project (via workspace) the active workspace lives in. */
  private readonly project = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    const ws = this.workspaces.workspaceById(id)();
    if (!ws) return null;
    return this.projects.byId(ws.projectId)();
  });

  protected readonly commandText = computed(
    () => this.project()?.runCommand ?? null,
  );

  protected readonly status = computed<RunStatus>(() => {
    const id = this.workspaceId();
    if (!id) return 'idle';
    return this.registry.ensureEntry(id).status();
  });

  protected readonly badgeVariant = computed<
    'default' | 'secondary' | 'destructive' | 'outline'
  >(() => {
    switch (this.status()) {
      case 'running':
        return 'default';
      case 'exited':
        return 'secondary';
      default:
        return 'outline';
    }
  });

  protected readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'running':
        return 'Running';
      case 'exited':
        return 'Exited';
      default:
        return 'Idle';
    }
  });

  private mounted: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      const isActive = this.active();
      if (!isActive || !id) {
        this.detach();
        return;
      }
      if (this.mounted === id) return;
      this.attach(id);
    });

    this.destroyRef.onDestroy(() => this.detach());
  }

  protected toggleEdit(): void {
    this.editing.update((v) => !v);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected async onSave(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const project = this.project();
    if (!project) return;
    const form = event.target as HTMLFormElement;
    const value = (form.elements.namedItem('run-command') as HTMLInputElement)
      ?.value;
    try {
      await this.projects.setRunCommand(
        project.id,
        value && value.trim().length > 0 ? value.trim() : null,
      );
      this.editing.set(false);
    } catch (err) {
      console.warn('[run] setRunCommand failed:', err);
    }
  }

  protected async onRun(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.registry.start(id);
    } catch (err) {
      console.warn('[run] start failed:', err);
    }
  }

  protected async onStop(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    await this.registry.stop(id);
  }

  private attach(workspaceId: string): void {
    this.detach();
    const entry = this.registry.ensureEntry(workspaceId);
    const el = this.host().nativeElement;
    if (entry.term.element) {
      el.appendChild(entry.term.element);
    } else {
      entry.term.open(el);
    }
    queueMicrotask(() => {
      try {
        entry.fit.fit();
      } catch (err) {
        console.warn('[run] initial fit failed:', err);
      }
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        try {
          entry.fit.fit();
        } catch (err) {
          console.warn('[run] fit on resize failed:', err);
        }
      });
      this.resizeObserver.observe(el);
    }
    this.mounted = workspaceId;
  }

  private detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.mounted == null) return;
    const el = this.host?.()?.nativeElement;
    if (el) {
      while (el.firstChild) {
        el.removeChild(el.firstChild);
      }
    }
    this.mounted = null;
  }
}
