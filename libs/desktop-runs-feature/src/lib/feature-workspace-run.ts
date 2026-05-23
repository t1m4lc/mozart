import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmEmptyImports } from '@mozart/ui/empty';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay } from '@ng-icons/lucide';
import { RunRegistry } from '@mozart/desktop-runs-data-access';
import type { RunStatus } from '@mozart/desktop-runs-util';

@Component({
  selector: 'app-feature-workspace-run',
  imports: [NgIcon, HlmButtonImports, HlmEmptyImports, HlmIconImports],
  providers: [provideIcons({ lucidePlay })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    @if (status() === 'idle' && !mounted) {
      <!-- Empty state with an inline "Run workspace" CTA. The host
           emits (requestStart) which the parent (workspace-aside)
           wires to the run registry — keeps this component free of
           run-orchestration knowledge. -->
      <div
        class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <ng-icon
          hlm
          name="lucidePlay"
          size="md"
          class="text-muted-foreground/60"
        />
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">Run your workspace</p>
          <p class="text-xs text-muted-foreground">
            Start the configured run command to see logs, ports, and exit
            status streamed here.
          </p>
        </div>
        <button
          hlmBtn
          type="button"
          size="sm"
          class="rounded"
          (click)="requestStart.emit()"
        >
          <ng-icon hlm name="lucidePlay" size="xs" />
          Run workspace
        </button>
      </div>
    }
    <div
      #host
      class="min-h-0 flex-1 overflow-hidden p-1"
      [class.hidden]="status() === 'idle' && !mounted"
    ></div>
  `,
})
export class FeatureWorkspaceRun {
  readonly workspaceId = input<string | null>(null);
  /** True when the Run tab is the active tab — defers xterm attach to
   *  avoid sizing against a hidden host. */
  readonly active = input<boolean>(false);
  /** User clicked the empty-state CTA. Parent hooks this to RunRegistry. */
  readonly requestStart = output<void>();

  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly registry = inject(RunRegistry);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = computed<RunStatus>(() => {
    const id = this.workspaceId();
    if (!id) return 'idle';
    return this.registry.ensureEntry(id).status();
  });

  protected mounted: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      const isActive = this.active();
      const st = this.status();
      // Mount only when a run has actually been initiated (status
      // !== 'idle'). Idle state shows the empty placeholder, no xterm.
      if (!isActive || !id || st === 'idle') {
        this.detach();
        return;
      }
      if (this.mounted === id) return;
      this.attach(id);
    });

    this.destroyRef.onDestroy(() => this.detach());
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
