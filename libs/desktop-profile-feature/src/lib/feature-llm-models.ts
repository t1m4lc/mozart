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
// picker, via the Spartan multi-select grouped by provider. Follows the
// idiomatic `hlm-select-multiple` pattern (object values + isItemEqualToValue
// + itemToString) so Brn dedupes value echoes instead of churning the signal.
// Empty preference ⇒ all runnable models shown (every row selected). At least
// one model must stay enabled so the composer never goes empty.
@Component({
  selector: 'app-feature-llm-models',
  imports: [HlmSelectImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-2">
      <hlm-select-multiple
        [value]="selectedModels()"
        [itemToString]="modelToString"
        [isItemEqualToValue]="modelsEqual"
        (valueChange)="onChange($any($event))"
      >
        <hlm-select-trigger class="w-full">
          <hlm-select-placeholder>Select models</hlm-select-placeholder>
          <ng-template hlmSelectValues let-values>
            <hlm-select-values-content>
              {{ values[0]?.name }}
              @if (values.length > 1) {
                <span class="text-muted-foreground"
                  >(+{{ values.length - 1 }} more)</span
                >
              }
            </hlm-select-values-content>
          </ng-template>
        </hlm-select-trigger>
        <hlm-select-content *hlmSelectPortal class="w-72">
          @for (g of groups(); track g.id) {
            <hlm-select-group>
              <hlm-select-label>{{ g.label }}</hlm-select-label>
              @for (m of g.models; track m.id) {
                <hlm-select-item [value]="m">{{ m.name }}</hlm-select-item>
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

  // The materialized enabled set bound to the multi-select, as the catalog
  // model objects (stable references). Empty preference ⇒ everything runnable
  // reads as selected (the catalog default).
  protected readonly selectedModels = computed<ModelOption[]>(() => {
    const ids = this.store.enabledIds();
    if (!ids.length) return [...this.runnable];
    const allow = new Set(ids);
    return this.runnable.filter((m) => allow.has(m.id));
  });

  protected readonly groups = computed(
    () =>
      PROVIDER_REGISTRY.flatMap((d) => {
        const models = this.runnable.filter((m) => m.provider === d.id);
        return models.length ? [{ id: d.id, label: d.label, models }] : [];
      }) as { id: string; label: string; models: readonly ModelOption[] }[],
  );

  protected readonly modelToString = (m: ModelOption): string => m?.name ?? '';

  protected readonly modelsEqual = (
    a: ModelOption,
    b: ModelOption | null,
  ): boolean => a?.id === b?.id;

  protected onChange(models: ModelOption[]): void {
    // Keep at least one enabled — ignore a fully-cleared selection.
    if (models.length === 0) return;
    void this.store.setEnabled(models.map((m) => m.id));
  }
}
