import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { HlmSelectImports } from '@mozart/ui/select';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideListFilter } from '@ng-icons/lucide';
import type { GroupBy } from '../../feature-list/project-list.store';

interface GroupByItem {
  label: string;
  value: GroupBy;
  disabled?: boolean;
}

@Component({
  selector: 'app-group-by-filter',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmPopoverImports,
    HlmSelectImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideListFilter })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmPopover>
      <button
        hlmPopoverTrigger
        hlmBtn
        variant="ghost"
        size="icon-xs"
        hlmTooltip="Filter"
        position="top"
        class="size-7 rounded-md text-muted-foreground"
      >
        <ng-icon hlm name="lucideListFilter" size="xs" />
      </button>
      <ng-template hlmPopoverPortal>
        <div hlmPopoverContent class="w-64 p-3">
          <div class="flex items-center gap-3">
            <span class="text-xs font-medium whitespace-nowrap">Group by</span>
            <hlm-select
              [value]="groupBy()"
              (valueChange)="groupByChange.emit(($event ?? 'project'))"
              [itemToString]="itemToString"
              class="flex-1"
            >
              <hlm-select-trigger class="w-full h-7 text-xs">
                <hlm-select-value placeholder="Project" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-group>
                  <hlm-select-label>Group by</hlm-select-label>
                  @for (item of items; track item.value) {
                    <hlm-select-item
                      [value]="item.value"
                      [disabled]="item.disabled ?? false"
                    >
                      {{ item.label }}
                    </hlm-select-item>
                  }
                </hlm-select-group>
              </hlm-select-content>
            </hlm-select>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class GroupByFilter {
  readonly groupBy = input.required<GroupBy>();
  readonly groupByChange = output<GroupBy>();

  protected readonly items: GroupByItem[] = [
    { label: 'Project', value: 'project' },
    { label: 'Status', value: 'status', disabled: true },
  ];

  protected readonly itemToString = (value: GroupBy): string =>
    this.items.find((i) => i.value === value)?.label ?? '';
}
