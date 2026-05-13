import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { HlmSelectImports } from '@mozart/ui/select';
import { HlmSeparatorImports } from '@mozart/ui/separator';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideListFilter } from '@ng-icons/lucide';
import type { GroupBy } from '../../feature-list/project-list.store';
import { ProjectListStore } from '../../feature-list/project-list.store';

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
//
// "All projects" is modelled as a sentinel item so the spartan
// hlm-select-multiple can drive both branches with one value array. The
// mutual-exclusion rule (selecting any specific project unchecks All,
// selecting All unchecks everything else) is enforced in valueChange.
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
  private readonly store = inject(ProjectListStore);

  readonly groupBy = input.required<GroupBy>();
  readonly groupByChange = output<GroupBy>();

  protected readonly groupByItems: GroupByItem[] = [
    { label: 'Project', value: 'project' },
    { label: 'Status', value: 'status', disabled: true },
  ];

  // "All projects" sentinel + one item per project — drives the
  // hlm-select-multiple option list.
  protected readonly projectItems = computed<ProjectFilterItem[]>(() => [
    { id: ALL_PROJECTS_ID, label: 'All', icon: null },
    ...this.store
      .projects()
      .map((p) => ({ id: p.id, label: p.title, icon: p.icon })),
  ]);

  // What the multi-select considers "selected" right now, derived from
  // the store. Either the sentinel alone, or one item per filtered id.
  protected readonly selectedItems = computed<ProjectFilterItem[]>(() => {
    const f = this.store.projectFilter();
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
  // The new array is whatever spartan computed after the user click; we
  // reconcile and dispatch the corresponding store mutation.
  protected onValueChange(next: ProjectFilterItem[]): void {
    const previous = this.selectedItems();
    const prevHadAll = previous.some((i) => i.id === ALL_PROJECTS_ID);
    const nextHasAll = next.some((i) => i.id === ALL_PROJECTS_ID);

    // Empty selection always falls back to "All projects".
    if (next.length === 0) {
      this.store.selectAllProjects();
      return;
    }

    // User just added "All projects" → force the state to all.
    if (nextHasAll && !prevHadAll) {
      this.store.selectAllProjects();
      return;
    }

    // "All projects" was selected before but the user picked a specific
    // one → drop the sentinel, keep only specific ids.
    if (prevHadAll && nextHasAll && next.length > 1) {
      const specific = next.filter((i) => i.id !== ALL_PROJECTS_ID);
      this.commitSpecific(specific);
      return;
    }

    // Plain multi-select of specific projects.
    this.commitSpecific(next.filter((i) => i.id !== ALL_PROJECTS_ID));
  }

  private commitSpecific(items: ProjectFilterItem[]): void {
    if (items.length === 0) {
      this.store.selectAllProjects();
      return;
    }
    // Diff current set vs target and apply per-id toggles, since the
    // store's API is one-id-at-a-time. Cheap (n ≤ projects count).
    const currentFilter = this.store.projectFilter();
    const currentSet =
      currentFilter === 'all' ? new Set<string>() : new Set(currentFilter);
    const targetSet = new Set(items.map((i) => i.id));

    for (const id of currentSet) {
      if (!targetSet.has(id)) this.store.toggleProjectInFilter(id);
    }
    for (const id of targetSet) {
      if (!currentSet.has(id)) this.store.toggleProjectInFilter(id);
    }
  }
}
