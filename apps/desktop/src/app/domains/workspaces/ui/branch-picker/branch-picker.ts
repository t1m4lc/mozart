import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmComboboxImports } from '@mozart/ui/combobox';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmKbdImports } from '@mozart/ui/kbd';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitBranch, lucideGitPullRequestArrow } from '@ng-icons/lucide';
import {
  BrnComboboxAnchor,
  BrnComboboxPopoverTrigger,
} from '@spartan-ng/brain/combobox';

@Component({
  selector: 'app-branch-picker',
  imports: [
    NgIcon,
    CdkTrapFocus,
    BrnComboboxAnchor,
    BrnComboboxPopoverTrigger,
    HlmButtonImports,
    HlmComboboxImports,
    HlmIconImports,
    HlmKbdImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideGitBranch, lucideGitPullRequestArrow })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-combobox
      [value]="value()"
      (valueChange)="valueChange.emit($event ?? '')"
      [itemToString]="toString"
      [filter]="filter"
    >
      <button
        brnComboboxAnchor
        brnComboboxPopoverTrigger
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        hlmTooltip="Target branch"
        position="bottom"
        class="size-7 shrink-0 rounded-md text-muted-foreground"
        data-tauri-drag-region="false"
      >
        <ng-icon hlm name="lucideGitPullRequestArrow" size="xs" />
      </button>
      <ng-template hlmComboboxPortal>
        <hlm-combobox-content class="w-60">
          <hlm-combobox-input
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            placeholder="Search branches…"
            showTrigger="false"
            showClear="true"
          />
          <div hlmComboboxList>
            @if (value()) {
              <hlm-combobox-item
                [value]="value()"
                disabled
                class="group/branch-item"
              >
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate font-semibold">{{ value() }}</span>
                <span class="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <span>target</span>
                  <kbd
                    hlmKbd
                    class="opacity-0 transition-opacity group-hover/branch-item:opacity-100 group-data-[active=true]/branch-item:opacity-100 group-data-[state=active]/branch-item:opacity-100"
                  >
                    Tab
                  </kbd>
                </span>
              </hlm-combobox-item>
            }
            @for (branch of otherBranches(); track branch) {
              <hlm-combobox-item [value]="branch">
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span>{{ branch }}</span>
              </hlm-combobox-item>
            }
            @if (currentBranch()) {
              <hlm-combobox-item [value]="currentBranch()" disabled>
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ currentBranch() }}</span>
                <span class="ml-auto text-xs text-muted-foreground">
                  current
                </span>
              </hlm-combobox-item>
            }
            @if (!hasAlternates()) {
              <div class="px-3 py-2 text-center text-sm text-muted-foreground">
                No other branches available.
              </div>
            }
            <hlm-combobox-empty>No branch found.</hlm-combobox-empty>
          </div>
        </hlm-combobox-content>
      </ng-template>
    </hlm-combobox>
  `,
})
export class BranchPicker {
  readonly value = input.required<string>();
  readonly branches = input.required<readonly string[]>();
  readonly currentBranch = input<string>('');
  readonly valueChange = output<string>();

  // Selectable branches minus the current target (the target is pinned
  // at the top of the list, the current workspace branch at the
  // bottom — both rendered as disabled focus-skipped rows).
  protected readonly otherBranches = computed(() =>
    this.branches().filter((b) => b !== this.value()),
  );

  // `true` when there is at least one branch beyond the workspace's
  // current branch — i.e. either a target is set or an other branch is
  // available. Drives the "No other branches available." empty state.
  protected readonly hasAlternates = computed(() => {
    if (this.value()) return true;
    return this.otherBranches().length > 0;
  });

  protected readonly toString = (v: string | null): string => v ?? '';
  protected readonly filter = (v: string, search: string): boolean =>
    v.toLowerCase().includes(search.toLowerCase());
}
