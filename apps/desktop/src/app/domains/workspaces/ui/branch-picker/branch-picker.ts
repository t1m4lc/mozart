import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmComboboxImports } from '@mozart/ui/combobox';
import { HlmIconImports } from '@mozart/ui/icon';
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
        class="size-6 shrink-0 rounded-md text-muted-foreground"
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
            @for (branch of branches(); track branch) {
              <hlm-combobox-item [value]="branch">
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span [class.font-semibold]="branch === value()">{{
                  branch
                }}</span>
              </hlm-combobox-item>
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
  readonly valueChange = output<string>();

  protected readonly toString = (v: string | null): string => v ?? '';
  protected readonly filter = (v: string, search: string): boolean =>
    v.toLowerCase().includes(search.toLowerCase());
}
