import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HlmAlertImports } from '@mozart/ui/alert';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmInputImports } from '@mozart/ui/input';
import { HlmLabelImports } from '@mozart/ui/label';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFile, lucideFolderOpen, lucideLayers } from '@ng-icons/lucide';
import { DIALOG_ADAPTER } from '@mozart/desktop-projects-data-access';
import { UiRadioCard } from '@mozart/desktop-projects-ui';

export interface CreateProjectContext {
  // Pre-resolved default parent location (e.g. `<home>/mozart/repos`).
  defaultParent: string;
  // Called once the folder is created — gives the flow the absolute
  // path of the new project root. Flow handles init + register + nav.
  onCreated: (path: string) => Promise<void>;
  // Performs the folder creation. Kept on the context so the dialog
  // stays a dumb view.
  doCreate: (parent: string, name: string) => Promise<string>;
}

type TemplateValue = 'empty' | 'gstack';

// "Create a project" dialog (Quick start). Name + parent + template
// radio + Create. On submit, creates `<parent>/<name>` and hands the
// path to the flow which runs init + register + auto-workspace +
// first chat + navigate.
//
// Plain signal-based form state, matches CloneRepoDialog / UiConnectDialog.
@Component({
  selector: 'app-create-project-dialog',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSpinnerImports,
    NgIcon,
    UiRadioCard,
  ],
  providers: [provideIcons({ lucideFile, lucideFolderOpen, lucideLayers })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Create a project</h3>
      <p hlmDialogDescription>
        Create a local folder and an empty project. The first workspace
        opens automatically.
      </p>
    </div>

    <form
      class="px-6 py-4 space-y-4"
      (submit)="onFormSubmit($event)"
      autocomplete="off"
    >
      <div class="space-y-1.5">
        <label hlmLabel for="create-name">Project name</label>
        <input
          hlmInput
          type="text"
          id="create-name"
          name="name"
          placeholder="my-project"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="off"
          #focusInput
          [value]="name()"
          (input)="onNameInput($event)"
          [disabled]="creating()"
        />
      </div>

      <div class="space-y-1.5">
        <label hlmLabel for="create-parent">Parent folder</label>
        <div class="flex gap-2">
          <input
            hlmInput
            type="text"
            id="create-parent"
            name="parent"
            autocomplete="off"
            spellcheck="false"
            autocapitalize="off"
            class="flex-1"
            [value]="parent()"
            (input)="onParentInput($event)"
            [disabled]="creating()"
          />
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="browse()"
            [disabled]="creating()"
          >
            <ng-icon hlm name="lucideFolderOpen" size="sm" />
            Browse
          </button>
        </div>
      </div>

      <fieldset class="space-y-1.5">
        <legend hlmLabel>Template</legend>
        <div role="radiogroup" class="grid grid-cols-2 gap-2">
          <app-ui-radio-card
            [selected]="template() === 'empty'"
            label="Empty"
            subtitle="Just a folder + git init"
            icon="lucideFile"
            [disabled]="creating()"
            (pick)="onTemplateChange('empty')"
          />
          <app-ui-radio-card
            [selected]="template() === 'gstack'"
            label="gstack"
            subtitle="Opinionated starter stack"
            icon="lucideLayers"
            badge="Soon"
            [disabled]="true"
            (pick)="onTemplateChange('gstack')"
          />
        </div>
      </fieldset>

      @if (error()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertDescription>{{ error() }}</p>
        </div>
      }

      <!-- Hidden submit so Enter triggers submit() from any text input. -->
      <button type="submit" class="hidden" aria-hidden="true"></button>
    </form>

    <div hlmDialogFooter class="px-6 py-4">
      <button
        hlmDialogClose
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="creating()"
      >
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        (click)="submit()"
        [disabled]="creating() || !canSubmit()"
      >
        @if (creating()) {
          <hlm-spinner aria-label="Creating" />
        } @else {
          Create
        }
      </button>
    </div>
  `,
})
export class CreateProjectDialog {
  private readonly ctx = injectBrnDialogContext<CreateProjectContext>();
  private readonly ref = inject(BrnDialogRef);
  private readonly dialogAdapter = inject(DIALOG_ADAPTER);
  private readonly focusInput =
    viewChild<ElementRef<HTMLInputElement>>('focusInput');

  protected readonly name = signal('');
  protected readonly parent = signal(this.ctx.defaultParent);
  protected readonly template = signal<TemplateValue>('empty');
  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.focusInput()?.nativeElement.focus());
  }

  protected readonly canSubmit = computed(
    () => this.name().trim().length > 0 && this.parent().trim().length > 0,
  );

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onParentInput(event: Event): void {
    this.parent.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onTemplateChange(value: string | undefined): void {
    // gstack is disabled — guard the cast.
    if (value === 'empty' || value === 'gstack') {
      this.template.set(value);
    }
  }

  protected async browse(): Promise<void> {
    const picked = await this.dialogAdapter.pickFolder({
      defaultPath: this.parent() || undefined,
    });
    if (picked) {
      this.parent.set(picked);
      this.error.set(null);
    }
  }

  protected onFormSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.creating()) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      const path = await this.ctx.doCreate(this.parent().trim(), this.name().trim());
      // Close before the post-create navigation so the user sees the
      // new workspace appear, not the dialog dismissing mid-route.
      this.ref.close();
      await this.ctx.onCreated(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error.set(msg || 'Create failed');
      this.creating.set(false);
    }
  }
}
