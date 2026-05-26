import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { commands } from '@mozart/desktop-core-tauri';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { ReturnRouteService } from '@mozart/desktop-ui-state-data-access';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmInputImports } from '@spartan-ui/input';
import { HlmLabelImports } from '@spartan-ui/label';

// Projects section of the settings shell. Two route shapes feed this
// page:
//   - `/settings/projects`            → picker (or auto-select if only
//                                       one project).
//   - `/settings/projects/:projectId` → form for the named project.
//
// The form is disabled while the project + detection data load so
// users can't half-edit a stale snapshot. Save persists both fields
// via the projects facade; detection hints from `.mozart/run.json`
// are shown as read-only suggestions and never auto-saved.
@Component({
  selector: 'app-project-settings-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full overflow-y-auto p-6' },
  template: `
    <div class="mx-auto max-w-3xl space-y-8">
      <header class="space-y-1">
        <p
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Settings
        </p>
        <h1 class="text-2xl font-semibold">Projects</h1>
      </header>

      <div class="grid gap-6 sm:grid-cols-[14rem_1fr]">
        <!-- Project picker. Keeps the user's mental model close to
             the global Settings sidebar: a list on the left, content
             on the right. Routing through routerLink rather than
             a click handler so deep-links into a specific project
             still light up the right entry. -->
        <nav
          aria-label="Projects"
          class="rounded-md border border-border/60 bg-muted/20"
        >
          @if (projectList().length === 0) {
            <p class="p-3 text-xs text-muted-foreground">
              No projects yet. Add one from the dashboard.
            </p>
          } @else {
            <ul class="flex flex-col p-1.5">
              @for (item of projectList(); track item.id) {
                <li>
                  <a
                    class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    [routerLink]="['/settings/projects', item.id]"
                    routerLinkActive="bg-brand/10 text-foreground!"
                  >
                    @if (item.icon) {
                      <span aria-hidden="true">{{ item.icon }}</span>
                    }
                    <span class="truncate">{{ item.name }}</span>
                  </a>
                </li>
              }
            </ul>
          }
        </nav>

        <section class="min-w-0 space-y-6">
          @if (!selectedId()) {
            <div
              class="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground"
            >
              Select a project on the left to configure its setup and run
              commands.
            </div>
          } @else if (loading()) {
            <div
              class="space-y-3 rounded-md border border-border/60 bg-muted/20 p-4"
            >
              <div class="h-4 w-32 animate-pulse rounded bg-muted"></div>
              <div class="h-9 w-full animate-pulse rounded bg-muted"></div>
              <div class="h-4 w-48 animate-pulse rounded bg-muted"></div>
              <div class="h-9 w-full animate-pulse rounded bg-muted"></div>
            </div>
          } @else {
            <header class="flex items-baseline justify-between gap-4">
              <h2 class="truncate text-lg font-semibold">{{ projectName() }}</h2>
            </header>

            <div
              class="space-y-3 rounded-md border border-border/60 bg-muted/30 p-4"
            >
              <div class="space-y-1.5">
                <label hlmLabel for="setup-command">Setup command</label>
                <input
                  hlmInput
                  id="setup-command"
                  name="setupCommand"
                  autocomplete="off"
                  spellcheck="false"
                  autocapitalize="off"
                  [value]="setupDraft()"
                  [placeholder]="setupPlaceholder()"
                  [disabled]="saving() || loading()"
                  (input)="onSetupInput($event)"
                />
                <p class="text-xs text-muted-foreground">
                  Runs once to install dependencies or prepare the project.
                  Examples: <code>pnpm install</code>, <code>npm install</code>,
                  <code>cargo build</code>.
                </p>
              </div>

              <div class="space-y-1.5">
                <label hlmLabel for="run-command">Run command</label>
                <input
                  hlmInput
                  id="run-command"
                  name="runCommand"
                  autocomplete="off"
                  spellcheck="false"
                  autocapitalize="off"
                  [value]="runDraft()"
                  [placeholder]="runPlaceholder()"
                  [disabled]="saving() || loading()"
                  (input)="onRunInput($event)"
                  (keydown.enter)="onSave()"
                />
                <p class="text-xs text-muted-foreground">
                  Mozart will launch this from the Run tab. Examples:
                  <code>pnpm dev</code>, <code>npm run dev</code>,
                  <code>cargo run</code>.
                </p>
              </div>

              @if (hasMozartFile()) {
                <p
                  class="rounded-sm bg-brand/10 px-2 py-1.5 text-[11px] text-foreground/80"
                >
                  This project has a <code>.mozart/run.json</code> file at
                  its root — those scripts take precedence over the values
                  saved here.
                </p>
              }

              <div class="flex justify-end gap-2">
                <button
                  hlmBtn
                  variant="ghost"
                  type="button"
                  [disabled]="saving() || loading() || !isDirty()"
                  (click)="onReset()"
                >
                  Reset
                </button>
                <button
                  hlmBtn
                  type="button"
                  [disabled]="saving() || loading() || !isDirty()"
                  (click)="onSave()"
                >
                  {{ saving() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export class ProjectSettingsPage {
  /** Optional route param. Empty when the URL is `/settings/projects`
   *  (picker view); set when `/settings/projects/:projectId`. */
  readonly projectId = input<string | undefined>();

  private readonly projects = inject(ProjectsFacade);
  private readonly router = inject(Router);
  private readonly returnRoute = inject(ReturnRouteService);

  // Visible project list for the picker, sorted by display name so
  // the column stays stable across saves.
  protected readonly projectList = computed(() =>
    [...this.projects.visible()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    ),
  );

  // Effective selection: prefer the route param, but auto-pick the
  // first project when the picker view has exactly one option so the
  // user lands on something useful instead of an empty pane.
  protected readonly selectedId = computed(() => {
    const fromRoute = this.projectId();
    if (fromRoute) return fromRoute;
    const list = this.projectList();
    return list.length === 1 ? list[0].id : null;
  });

  protected readonly project = computed(() => {
    const id = this.selectedId();
    return id ? this.projects.byId(id)() : null;
  });
  protected readonly projectName = computed(
    () => this.project()?.name ?? 'Project',
  );

  // Loading state: true while we wait for the project list to hydrate
  // OR while we read the detection hint from .mozart/run.json. Form
  // inputs / Save / Reset disable while this is true.
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly hasMozartFile = signal(false);
  protected readonly detectedSetup = signal<string | null>(null);
  protected readonly detectedRun = signal<string | null>(null);

  // Drafts re-seed from the persisted value when the selected
  // project changes; remain user-editable in between.
  protected readonly setupDraft = linkedSignal<string>(
    () => this.project()?.setupCommand ?? '',
  );
  protected readonly runDraft = linkedSignal<string>(
    () => this.project()?.runCommand ?? '',
  );

  protected readonly setupPlaceholder = computed(
    () => this.detectedSetup() ?? 'e.g. pnpm install',
  );
  protected readonly runPlaceholder = computed(
    () => this.detectedRun() ?? 'e.g. pnpm dev',
  );

  protected readonly isDirty = computed(() => {
    const p = this.project();
    if (!p) return false;
    const setup = this.setupDraft().trim();
    const run = this.runDraft().trim();
    return setup !== (p.setupCommand ?? '') || run !== (p.runCommand ?? '');
  });

  constructor() {
    // Auto-redirect to the single project case so the user lands on a
    // form. Avoids a useless picker click when there's nothing to pick.
    effect(() => {
      if (this.projectId()) return;
      const list = this.projectList();
      if (list.length === 1) {
        void this.router.navigate(['/settings/projects', list[0].id], {
          replaceUrl: true,
        });
      }
    });

    effect(() => {
      const id = this.selectedId();
      if (!id) {
        this.loading.set(false);
        this.detectedSetup.set(null);
        this.detectedRun.set(null);
        this.hasMozartFile.set(false);
        return;
      }
      this.loading.set(true);
      void this.loadDetected(id);
    });
  }

  private async loadDetected(projectId: string): Promise<void> {
    try {
      const result = await commands.readProjectConfig(projectId);
      if (this.selectedId() !== projectId) return;
      if (result.status !== 'ok') {
        this.detectedSetup.set(null);
        this.detectedRun.set(null);
        this.hasMozartFile.set(false);
        return;
      }
      const parsed = safeParseRunJson(result.data.runJson);
      this.detectedSetup.set(parsed.setup);
      this.detectedRun.set(parsed.run);
      this.hasMozartFile.set(result.data.source === 'repo');
    } catch (err) {
      console.warn('[project-settings] readProjectConfig failed:', err);
      this.detectedSetup.set(null);
      this.detectedRun.set(null);
      this.hasMozartFile.set(false);
    } finally {
      if (this.selectedId() === projectId) {
        this.loading.set(false);
      }
    }
  }

  protected onSetupInput(event: Event): void {
    this.setupDraft.set((event.target as HTMLInputElement).value);
  }

  protected onRunInput(event: Event): void {
    this.runDraft.set((event.target as HTMLInputElement).value);
  }

  protected onReset(): void {
    const p = this.project();
    this.setupDraft.set(p?.setupCommand ?? '');
    this.runDraft.set(p?.runCommand ?? '');
  }

  protected async onSave(): Promise<void> {
    if (this.saving() || this.loading() || !this.isDirty()) return;
    const p = this.project();
    if (!p) return;
    const nextSetup = this.setupDraft().trim();
    const nextRun = this.runDraft().trim();
    this.saving.set(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (nextSetup !== (p.setupCommand ?? '')) {
        tasks.push(
          this.projects.setSetupCommand(
            p.id,
            nextSetup.length > 0 ? nextSetup : null,
          ),
        );
      }
      if (nextRun !== (p.runCommand ?? '')) {
        tasks.push(
          this.projects.setRunCommand(
            p.id,
            nextRun.length > 0 ? nextRun : null,
          ),
        );
      }
      await Promise.all(tasks);
      toast.success('Project commands saved.');
      void this.router.navigateByUrl(this.returnRoute.previous());
    } catch (err) {
      console.warn('[project-settings] save failed:', err);
      toast.error('Couldn’t save project commands.', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.saving.set(false);
    }
  }
}

interface ParsedScripts {
  readonly setup: string | null;
  readonly run: string | null;
}

// `.mozart/run.json` schema: `{ "scripts": { "setup": "...", "run":
// "..." } }`. Pull both entries; the page renders them as
// placeholders only.
function safeParseRunJson(raw: string): ParsedScripts {
  try {
    const parsed = JSON.parse(raw) as {
      scripts?: { setup?: unknown; run?: unknown };
    };
    return {
      setup: cleanScript(parsed?.scripts?.setup),
      run: cleanScript(parsed?.scripts?.run),
    };
  } catch {
    return { setup: null, run: null };
  }
}

function cleanScript(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
