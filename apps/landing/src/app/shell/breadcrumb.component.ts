import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmBreadcrumbImports } from '@spartan-ui/breadcrumb';

export interface BreadcrumbItem {
  readonly label: string;
  readonly link?: string;
}

@Component({
  selector: 'app-breadcrumb',
  imports: [HlmBreadcrumbImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav hlmBreadcrumb>
      <ol hlmBreadcrumbList>
        @for (crumb of crumbs(); track crumb.label; let last = $last) {
          <li hlmBreadcrumbItem>
            @if (last) {
              <span hlmBreadcrumbPage>{{ crumb.label }}</span>
            } @else if (crumb.link) {
              <a hlmBreadcrumbLink [link]="crumb.link">{{ crumb.label }}</a>
            } @else {
              <span>{{ crumb.label }}</span>
            }
          </li>
          @if (!last) {
            <li hlmBreadcrumbSeparator></li>
          }
        }
      </ol>
    </nav>
  `,
})
export class BreadcrumbComponent {
  readonly crumbs = input.required<readonly BreadcrumbItem[]>();
}
