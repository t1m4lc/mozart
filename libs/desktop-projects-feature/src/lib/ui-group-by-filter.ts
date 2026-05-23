import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmPopoverImports } from '@spartan-ui/popover';
import { HlmSelectImports } from '@spartan-ui/select';
import { HlmSeparatorImports } from '@spartan-ui/separator';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideListFilter } from '@ng-icons/lucide';
import { ProjectsFacade, type GroupBy } from '@mozart/desktop-projects-data-access';

interface GroupByItem {
  label: string;
  value: GroupBy;
  disabled?: boolean;
}

// Sentinel item representing the "no filter / show all" choice.
// Lives at the head of the multi-select so it can never collide with a
// real project id.
const ALL_PROJECTS_ID = '__all__';

interface ProjectFilterItem {
  id: string;
  label: string;
  icon: string | null;
}

// Filter popover: groups the GroupBy select and a project multi-select
// behind a single icon-button trigger.
@Component({
  selector: 'app-group-by-filter',
  imports: [
    NgIcon,
    HlmPopoverImports,
    HlmSelectImports,
    HlmSeparatorImports,
    HlmTooltipImports,
    NgIcon,
    HlmIconImports,
  ],
  providers: [provideIcons({ lucideListFilter })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmPopover>
      <button
        #triggerBtn
        hlmPopoverTrigger
        type="button"
        aria-label="Filter"
        hlmTooltip="Filter"
        position="bottom"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ng-icon hlm name="lucideListFilter" size="xs" />
      </button>
      <ng-template hlmPopoverPortal>
        <div
          hlmPopoverContent
          side="right"
          align="start"
          class="grid w-72 grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 p-3"
        >
          <span
            class="text-xs font-light whitespace-nowrap text-muted-foreground"
          >
            Group by
          </span>
          <hlm-select
            [value]="groupBy()"
            (valueChange)="groupByChange.emit($event ?? 'project')"
            [itemToString]="groupByItemToString"
          >
            <hlm-select-trigger class="w-full h-7 text-xs">
              <hlm-select-value placeholder="Project" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-group>
                <hlm-select-label class="sr-only">Group by</hlm-select-label>
                @for (item of groupByItems; track item.value) {
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

          <span
            class="text-xs font-light whitespace-nowrap text-muted-foreground"
          >
            Show projects
          </span>
          <hlm-select-multiple
            [value]="selectedItems()"
            [itemToString]="projectItemToString"
            [isItemEqualToValue]="projectItemsEqual"
            (valueChange)="onValueChange($any($event))"
          >
            <hlm-select-trigger class="w-full h-7 text-xs">
              <hlm-select-placeholder>Select projects</hlm-select-placeholder>
              <ng-template hlmSelectValues let-values>
                <hlm-select-values-content>
                  {{ values[0]?.label }}
                  @if (values.length > 1) {
                    <span class="text-muted-foreground"
                      >(+{{ values.length - 1 }} more)</span
                    >
                  }
                </hlm-select-values-content>
              </ng-template>
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal class="w-60">
              <hlm-select-group>
                <hlm-select-label class="sr-only">Projects</hlm-select-label>
                @for (item of projectItems(); track item.id) {
                  <hlm-select-item [value]="item">
                    @if (item.icon) {
                      <span class="text-sm leading-none">{{ item.icon }}</span>
                    }
                    <span>{{ item.label }}</span>
                  </hlm-select-item>
                }
              </hlm-select-group>
            </hlm-select-content>
          </hlm-select-multiple>
        </div>
      </ng-template>
    </div>
  `,
})
export class GroupByFilter {
  private readonly facade = inject(ProjectsFacade);
  private readonly triggerBtn =
    viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly groupBy = input.required<GroupBy>();
  readonly groupByChange = output<GroupBy>();

  /** Open the filter popover programmatically (used by the projects-header context menu). */
  open(): void {
    this.triggerBtn()?.nativeElement.click();
  }

  protected readonly groupByItems: GroupByItem[] = [
    { label: 'Project', value: 'project' },
    { label: 'Status', value: 'status' },
  ];

  // "All projects" sentinel + one item per project in the DB.
  // The dropdown must list every project so the user can re-add a
  // project they previously filtered out — reading `visible()` here
  // would collapse the available choices to the currently-shown
  // subset and trap the user.
  protected readonly projectItems = computed<ProjectFilterItem[]>(() => [
    { id: ALL_PROJECTS_ID, label: 'All', icon: null },
    ...this.facade
      .all()
      .map((p) => ({ id: p.id, label: p.name, icon: p.icon })),
  ]);

  // What the multi-select considers "selected" right now, derived from
  // the facade. Either the sentinel alone, or one item per filtered id.
  protected readonly selectedItems = computed<ProjectFilterItem[]>(() => {
    const f = this.facade.projectFilter();
    const all = this.projectItems();
    if (f === 'all') {
      return [all[0]];
    }
    return all.filter((i) => i.id !== ALL_PROJECTS_ID && f.has(i.id));
  });

  protected readonly groupByItemToString = (value: GroupBy): string =>
    this.groupByItems.find((i) => i.value === value)?.label ?? '';

  protected readonly projectItemToString = (item: ProjectFilterItem): string =>
    item?.label ?? '';

  protected readonly projectItemsEqual = (
    a: ProjectFilterItem,
    b: ProjectFilterItem | null,
  ): boolean => a?.id === b?.id;

  // Mutual-exclusion logic between "All projects" and specific projects.
  protected onValueChange(next: ProjectFilterItem[]): void {
    const previous = this.selectedItems();
    const prevHadAll = previous.some((i) => i.id === ALL_PROJECTS_ID);
    const nextHasAll = next.some((i) => i.id === ALL_PROJECTS_ID);

    if (next.length === 0) {
      this.facade.selectAllProjects();
      return;
    }

    if (nextHasAll && !prevHadAll) {
      this.facade.selectAllProjects();
      return;
    }

    if (prevHadAll && nextHasAll && next.length > 1) {
      const specific = next.filter((i) => i.id !== ALL_PROJECTS_ID);
      this.commitSpecific(specific);
      return;
    }

    this.commitSpecific(next.filter((i) => i.id !== ALL_PROJECTS_ID));
  }

  private commitSpecific(items: ProjectFilterItem[]): void {
    if (items.length === 0) {
      this.facade.selectAllProjects();
      return;
    }
    const currentFilter = this.facade.projectFilter();
    const currentSet =
      currentFilter === 'all' ? new Set<string>() : new Set(currentFilter);
    const targetSet = new Set(items.map((i) => i.id));

    for (const id of currentSet) {
      if (!targetSet.has(id)) this.facade.toggleProjectInFilter(id);
    }
    for (const id of targetSet) {
      if (!currentSet.has(id)) this.facade.toggleProjectInFilter(id);
    }
  }
}
