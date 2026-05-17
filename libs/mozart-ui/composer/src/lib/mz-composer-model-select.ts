import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmSelectImports } from '@mozart/ui/select';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCpu,
  lucideHardDrive,
  lucideSparkles,
} from '@ng-icons/lucide';

export type ProviderId = 'anthropic' | 'openai' | 'local';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  readonly iconName: string;
}

export interface ModelOption {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly enabled: boolean;
  readonly isNew?: boolean;
}

interface ProviderGroup {
  readonly info: ProviderInfo;
  readonly models: readonly ModelOption[];
}

const DEFAULT_PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { id: 'anthropic', label: 'Anthropic', iconName: 'lucideSparkles' },
  openai: { id: 'openai', label: 'OpenAI', iconName: 'lucideCpu' },
  local: { id: 'local', label: 'Local', iconName: 'lucideHardDrive' },
};

/**
 * Private to `HlmComposer`. Grouped model picker. Trigger shows the
 * provider icon + model short name; the popover groups models by
 * provider and dims rows whose `enabled === false` with a "Coming
 * soon" badge.
 */
@Component({
  selector: 'mz-composer-model-select',
  imports: [NgIcon, HlmBadgeImports, HlmSelectImports, HlmTooltipImports],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCpu,
      lucideHardDrive,
      lucideSparkles,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <hlm-select
      [value]="selectedModelId()"
      (valueChange)="_onValueChange($event)"
    >
      <hlm-select-trigger
        size="sm"
        hlmTooltip="Change model"
        class="h-6 rounded-md border-transparent shadow-none px-1.5 gap-1"
      >
        <ng-icon hlm [name]="_triggerIcon()" size="xs" />
        <span class="text-xs">{{ _triggerLabel() }}</span>
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal class="w-64">
        @for (group of _groups(); track group.info.id) {
          <hlm-select-group>
            <hlm-select-label class="flex items-center gap-1.5">
              <ng-icon hlm [name]="group.info.iconName" size="xs" />
              <span>{{ group.info.label }}</span>
            </hlm-select-label>
            @for (m of group.models; track m.id) {
              <hlm-select-item [value]="m.id" [disabled]="!m.enabled">
                <span class="flex flex-1 items-center gap-2">
                  <span>{{ m.name }}</span>
                  @if (m.isNew) {
                    <hlm-badge variant="secondary" class="text-[10px]">
                      New
                    </hlm-badge>
                  }
                  @if (!m.enabled) {
                    <hlm-badge variant="secondary" class="text-[10px]">
                      Coming soon
                    </hlm-badge>
                  }
                </span>
                @if (selectedModelId() === m.id) {
                  <ng-icon
                    hlm
                    name="lucideCheck"
                    size="xs"
                    class="text-muted-foreground"
                  />
                }
              </hlm-select-item>
            }
          </hlm-select-group>
        }
      </hlm-select-content>
    </hlm-select>
  `,
})
export class ComposerModelSelect {
  readonly models = input.required<readonly ModelOption[]>();
  readonly providers = input<Record<ProviderId, ProviderInfo>>(
    DEFAULT_PROVIDERS,
  );
  readonly selectedModelId = input.required<string>();
  readonly modelChange = output<string>();

  protected readonly _selectedModel = computed<ModelOption | undefined>(
    () =>
      this.models().find((m) => m.id === this.selectedModelId()) ??
      this.models()[0],
  );

  protected readonly _triggerIcon = computed<string>(() => {
    const m = this._selectedModel();
    if (!m) return 'lucideSparkles';
    return this.providers()[m.provider]?.iconName ?? 'lucideSparkles';
  });

  protected readonly _triggerLabel = computed<string>(
    () => this._selectedModel()?.name ?? 'Model',
  );

  protected readonly _groups = computed<readonly ProviderGroup[]>(() => {
    const list = this.models();
    const byProvider = new Map<ProviderId, ModelOption[]>();
    for (const m of list) {
      const bucket = byProvider.get(m.provider) ?? [];
      bucket.push(m);
      byProvider.set(m.provider, bucket);
    }
    const providers = this.providers();
    return [...byProvider.entries()].map(([id, models]) => ({
      info: providers[id],
      models,
    }));
  });

  protected _onValueChange(next: unknown): void {
    if (typeof next !== 'string' || !next) return;
    const target = this.models().find((m) => m.id === next);
    if (!target || !target.enabled) return;
    if (next === this.selectedModelId()) return;
    this.modelChange.emit(next);
  }
}
