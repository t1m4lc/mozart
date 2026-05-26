import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { RunRegistry } from '@mozart/desktop-runs-data-access';
import type { RunStatus } from '@mozart/desktop-runs-util';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { MzLoader } from '@mozart-ui/loader';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCircleCheck,
  lucideListTree,
  lucidePlay,
  lucideSquare,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';

// Setup tab — renders the setup-command PTY in its own xterm so its
// output never bleeds into the Run tab. Three visual states:
//
//   1. No command configured → empty card with CTA to project settings.
//   2. Command configured, status `idle` (never started, or after a
//      dispose) → empty card with "Start setup" button.
//   3. Status `running` or `exited` → xterm host + Stop/Start-again
//      controls in a slim header.
//
// The xterm mount logic mirrors `FeatureWorkspaceRun`: attach when the
// status leaves `idle`, keep the element alive afterwards so users can
// scroll back through the install log without re-running it. Status is
// independent of the run-command entry, so the toolbar Run button stays
// usable once setup exits.
@Component({
  selector: 'app-feature-workspace-setup',
  imports: [MzLoader, NgIcon, RouterLink, HlmButtonImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCircleCheck,
      lucideListTree,
      lucidePlay,
      lucideSquare,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    @if (status() !== 'idle' || mounted) {
      <div
        class="flex shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 py-1 text-xs"
      >
        @if (status() === 'running') {
          <span class="flex items-center gap-1.5 text-muted-foreground">
            <span
              class="inline-block size-1.5 animate-pulse rounded-full bg-brand"
            ></span>
            Setup running…
          </span>
          <span class="flex-1"></span>
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            class="h-7 gap-1.5 px-2 text-xs"
            (click)="onStopSetup()"
          >
            <ng-icon hlm name="lucideSquare" size="xs" />
            Stop
          </button>
        } @else {
          <span class="flex items-center gap-1.5 text-muted-foreground">
            <ng-icon hlm name="lucideCircleCheck" size="xs" class="text-brand" />
            Setup finished
          </span>
          <span class="flex-1"></span>
          @if (projectId(); as pid) {
            <a
              hlmBtn
              variant="ghost"
              size="sm"
              class="h-7 gap-1.5 px-2 text-xs"
              [routerLink]="['/settings/projects', pid]"
            >
              Edit command
              <ng-icon hlm name="lucideArrowRight" size="xs" />
            </a>
          }
        }
      </div>
    }
    <div
      #host
      class="min-h-0 flex-1 overflow-hidden p-1"
      [class.hidden]="status() === 'idle' && !mounted"
    ></div>
    @if (status() === 'idle' && !mounted && setupInProgress()) {
      <!-- Auto-detected install is running (no PTY surfaced — Tauri's
           installPackages is one-shot). Show a centered loader so the
           user knows something is happening; the Setup tab will swap
           to the "completed" view once installFor flips to success. -->
      <div
        class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <mz-loader size="md" class="text-brand" />
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">
            Installing dependencies…
          </p>
          <p class="max-w-sm text-xs text-muted-foreground">
            Mozart is preparing this workspace. Run is paused until setup
            finishes.
          </p>
        </div>
      </div>
    } @else if (status() === 'idle' && !mounted) {
      <div
        class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <ng-icon
          hlm
          [name]="setupAlreadyDone() ? 'lucideCircleCheck' : 'lucideListTree'"
          size="md"
          [class]="setupAlreadyDone() ? 'text-brand' : 'text-muted-foreground/60'"
        />
        @if (setupAlreadyDone()) {
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              Setup completed
            </p>
            <p class="max-w-sm text-xs text-muted-foreground">
              Setup is a one-time command Mozart runs when this workspace is
              initialized. It already finished — there's nothing to do here
              unless you want to change the command.
            </p>
          </div>
          @if (projectId(); as pid) {
            <a
              hlmBtn
              variant="outline"
              [routerLink]="['/settings/projects', pid]"
            >
              Edit setup command
              <ng-icon hlm name="lucideArrowRight" size="sm" />
            </a>
          }
        } @else if (hasSetupCommand()) {
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              Set up your workspace
            </p>
            <p class="max-w-sm text-xs text-muted-foreground">
              The setup command runs once when this workspace is initialized.
              It hasn't finished yet — start it now to install dependencies or
              prepare the project.
            </p>
          </div>
          <button
            hlmBtn
            variant="outline"
            type="button"
            [disabled]="!canStart()"
            (click)="onRunSetup()"
          >
            <ng-icon hlm name="lucidePlay" size="sm" />
            Start setup
          </button>
          @if (projectId(); as pid) {
            <a
              class="text-[11px] text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
              [routerLink]="['/settings/projects', pid]"
            >
              Edit setup command in project settings →
            </a>
          }
        } @else if (hasRunCommand()) {
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              No setup command yet
            </p>
            <p class="max-w-sm text-xs text-muted-foreground">
              You have a run command, but no setup command configured. Add one
              in project settings to install dependencies from here.
            </p>
          </div>
          @if (projectId(); as pid) {
            <a
              hlmBtn
              variant="outline"
              [routerLink]="['/settings/projects', pid]"
            >
              Edit project settings
              <ng-icon hlm name="lucideArrowRight" size="sm" />
            </a>
          }
        } @else {
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              Set up your project
            </p>
            <p class="max-w-sm text-xs text-muted-foreground">
              Mozart needs to know how to run this project before the setup
              and run tabs can do anything. Save a command in project settings
              and you'll be able to launch it from here.
            </p>
          </div>
          @if (effective().runCommand; as suggestion) {
            <p class="text-[11px] text-muted-foreground/80">
              Detected: <code class="font-mono">{{ suggestion }}</code>
            </p>
          }
          @if (projectId(); as pid) {
            <a
              hlmBtn
              variant="default"
              [routerLink]="['/settings/projects', pid]"
            >
              Set up commands in project settings
              <ng-icon hlm name="lucideArrowRight" size="sm" />
            </a>
          }
        }
      </div>
    }
  `,
})
export class FeatureWorkspaceSetup {
  /** True when the Setup tab is the active bottom tab. Defers xterm
   *  attach so FitAddon measures a non-zero host. */
  readonly active = input<boolean>(false);

  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly runs = inject(RunRegistry);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly workspaceId = this.workspaces.activeId;

  protected readonly projectId = computed<string | null>(() => {
    const id = this.workspaceId();
    if (!id) return null;
    const ws = this.workspaces.workspaceById(id)();
    return ws?.projectId ?? null;
  });

  protected readonly status = computed<RunStatus>(() => {
    const id = this.workspaceId();
    if (!id) return 'idle';
    return this.runs.ensureSetupEntry(id).status();
  });

  /** True once setup has run to completion in this session — either
   *  through the auto-install kicked at workspace bootstrap
   *  (WorkspacesFacade.installFor → 'success' | 'no_package') or
   *  through a manual Setup-tab click that exited. Drives the
   *  template's "Setup completed" state, which hides the Start /
   *  Run-again CTAs and points the user at project settings if they
   *  want to change the command. */
  protected readonly setupAlreadyDone = computed<boolean>(() => {
    const id = this.workspaceId();
    if (!id) return false;
    const install = this.workspaces.installFor(id);
    if (install.state === 'success' || install.state === 'no_package') {
      return true;
    }
    return this.status() === 'exited';
  });

  /** True while the workspace's setup PTY OR the auto-detected
   *  installPackages flow is mid-run. Drives both the "Installing
   *  dependencies…" loader and the disabled state of the start CTAs. */
  protected readonly setupInProgress = computed<boolean>(() => {
    const id = this.workspaceId();
    if (!id) return false;
    return this.workspaces.installFor(id).state === 'running';
  });

  /** True only when no PTY (run or setup) and no auto-install are
   *  currently executing — i.e. it's safe to start a setup PTY. */
  protected readonly canStart = computed<boolean>(() => {
    const id = this.workspaceId();
    if (!id) return false;
    if (!this.hasSetupCommand()) return false;
    if (this.setupInProgress()) return false;
    return !this.runs.isBusy(id);
  });

  // Reactive view of `(runCommand, setupCommand)` merging the DB
  // columns with the project's `.mozart/run.json`. The parent already
  // kicks `ensureDetectedScripts` once on workspace mount; reading the
  // computed without re-kicking is enough here.
  protected readonly effective = computed(() => {
    const pid = this.projectId();
    if (!pid) return EMPTY_EFFECTIVE;
    return this.projects.effectiveCommandsFor(pid)();
  });

  protected readonly hasRunCommand = computed(() => !!this.effective().runCommand);
  protected readonly hasSetupCommand = computed(() => !!this.effective().setupCommand);

  protected mounted: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // Belt-and-braces: kick the probe locally too so the Setup tab
    // works in isolation (e.g. if the parent hierarchy ever changes).
    effect(() => {
      const pid = this.projectId();
      if (!pid) return;
      void this.projects.ensureDetectedScripts(pid);
    });

    effect(() => {
      const id = this.workspaceId();
      const st = this.status();
      const isActive = this.active();
      if (!isActive || !id || st === 'idle') {
        this.detach();
        return;
      }
      if (this.mounted === id) return;
      this.attach(id);
    });

    this.destroyRef.onDestroy(() => this.detach());
  }

  protected async onRunSetup(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.runs.startSetup(id);
    } catch (err) {
      console.warn('[ws-setup] startSetup failed:', err);
    }
  }

  protected async onStopSetup(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[ws-setup] stopSetup failed:', err);
    }
  }

  private attach(workspaceId: string): void {
    this.detach();
    const entry = this.runs.ensureSetupEntry(workspaceId);
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
        console.warn('[ws-setup] initial fit failed:', err);
      }
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        try {
          entry.fit.fit();
        } catch (err) {
          console.warn('[ws-setup] fit on resize failed:', err);
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

interface EffectiveCommands {
  readonly runCommand: string | null;
  readonly setupCommand: string | null;
}

const EMPTY_EFFECTIVE: EffectiveCommands = {
  runCommand: null,
  setupCommand: null,
};
