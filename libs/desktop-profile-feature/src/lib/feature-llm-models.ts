import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCpu, lucideHardDrive, lucideSparkles } from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSelectImports } from '@spartan-ui/select';
import { ComposerModelsStore } from '@mozart/desktop-llm-model-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import {
  PROVIDER_REGISTRY,
  agentProviderForModel,
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
  imports: [NgIcon, HlmIconImports, HlmSelectImports],
  providers: [
    provideIcons({ lucideSparkles, lucideCpu, lucideHardDrive }),
  ],
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
              <hlm-select-label class="flex items-center gap-1.5">
                <!-- Subtle grayscale provider mark. The lucide glyphs are
                     monochrome (currentColor); the muted token desaturates
                     them so they read as quiet provider hints, not accents. -->
                <ng-icon
                  hlm
                  [name]="g.iconName"
                  size="xs"
                  class="text-muted-foreground/70"
                />
                <span>{{ g.label }}</span>
              </hlm-select-label>
              @for (m of g.models; track m.id) {
                <hlm-select-item [value]="m" [disabled]="isUnavailable(m)">
                  <span class="flex flex-1 items-center gap-2">
                    <span>{{ m.name }}</span>
                    @if (isUnavailable(m)) {
                      <span class="text-muted-foreground/70 text-[10px]">
                        Not connected
                      </span>
                    }
                  </span>
                </hlm-select-item>
              }
            </hlm-select-group>
          }
        </hlm-select-content>
      </hlm-select-multiple>
      <p class="text-muted-foreground text-xs">
        Only enabled models appear in the composer. At least one must stay
        enabled. Models from providers you haven't connected are disabled.
      </p>
    </div>
  `,
})
export class FeatureLlmModels {
  private readonly store = inject(ComposerModelsStore);
  private readonly profile = inject(ProfileFacade);

  private readonly runnable = selectableComposerModels();

  // Agent backends the user has actually connected. A model whose backend
  // isn't here is shown but disabled — the user can't run it yet.
  private readonly connected = computed(
    () => new Set(this.profile.connectedAgentProviders()),
  );

  protected readonly isUnavailable = (m: ModelOption): boolean =>
    !this.connected().has(agentProviderForModel(m.provider));

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
        return models.length
          ? [{ id: d.id, label: d.label, iconName: d.iconName, models }]
          : [];
      }) as {
        id: string;
        label: string;
        iconName: string;
        models: readonly ModelOption[];
      }[],
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
