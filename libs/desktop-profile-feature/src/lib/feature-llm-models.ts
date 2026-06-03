import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HlmSelectImports } from '@spartan-ui/select';
import { ComposerModelsStore } from '@mozart/desktop-llm-model-data-access';
import {
  PROVIDER_REGISTRY,
  selectableComposerModels,
  type ModelOption,
} from '@mozart/desktop-llm-model-util';

// Settings section: choose which models appear in the composer's model
// picker, via a Spartan multi-select grouped by provider. Empty preference ⇒
// all runnable models shown (every row selected). At least one model must
// stay enabled so the composer never goes empty.
@Component({
  selector: 'app-feature-llm-models',
  imports: [HlmSelectImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-2">
      <hlm-select-multiple
        [value]="selectedIds()"
        [itemToString]="idToName"
        (valueChange)="onChange($any($event))"
      >
        <hlm-select-trigger class="w-full">
          <hlm-select-placeholder>Select models</hlm-select-placeholder>
          <ng-template hlmSelectValues let-values>
            <hlm-select-values-content>
              {{ values.length }} of {{ total() }} models
            </hlm-select-values-content>
          </ng-template>
        </hlm-select-trigger>
        <hlm-select-content *hlmSelectPortal class="w-72">
          @for (g of groups(); track g.id) {
            <hlm-select-group>
              <hlm-select-label>{{ g.label }}</hlm-select-label>
              @for (m of g.models; track m.id) {
                <hlm-select-item [value]="m.id">{{ m.name }}</hlm-select-item>
              }
            </hlm-select-group>
          }
        </hlm-select-content>
      </hlm-select-multiple>
      <p class="text-muted-foreground text-xs">
        Only enabled models appear in the composer. At least one must stay
        enabled.
      </p>
    </div>
  `,
})
export class FeatureLlmModels {
  private readonly store = inject(ComposerModelsStore);

  private readonly runnable = selectableComposerModels();

  protected readonly total = computed(() => this.runnable.length);

  // The materialized enabled set bound to the multi-select. Empty preference
  // ⇒ everything runnable reads as selected (the catalog default).
  protected readonly selectedIds = computed<string[]>(() => {
    const ids = this.store.enabledIds();
    return ids.length ? [...ids] : this.runnable.map((m) => m.id);
  });

  protected readonly groups = computed(
    () =>
      PROVIDER_REGISTRY.flatMap((d) => {
        const models = this.runnable.filter((m) => m.provider === d.id);
        return models.length ? [{ id: d.id, label: d.label, models }] : [];
      }) as { id: string; label: string; models: readonly ModelOption[] }[],
  );

  protected readonly idToName = (id: string): string =>
    this.runnable.find((m) => m.id === id)?.name ?? id;

  protected onChange(ids: string[]): void {
    // Keep at least one enabled — ignore a fully-cleared selection.
    if (ids.length === 0) return;
    void this.store.setEnabled(ids);
  }
}
