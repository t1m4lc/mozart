import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DocsSidebarComponent } from './docs-sidebar.component';

@Component({
  selector: 'app-docs-shell',
  imports: [DocsSidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <details
      class="border-border bg-background mx-4 mt-4 mb-2 rounded-lg border md:hidden [&[open]>summary>span:last-child]:rotate-180"
    >
      <summary
        class="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
      >
        <span>Documentation</span>
        <span class="text-foreground/60 transition-transform">▾</span>
      </summary>
      <div
        class="border-border max-h-[60vh] overflow-y-auto border-t px-2 py-3"
      >
        <app-docs-sidebar />
      </div>
    </details>

    <div
      class="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-screen-xl flex-1 px-4 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] lg:px-8 xl:grid-cols-[13rem_minmax(0,1fr)_14rem]"
    >
      <aside
        class="border-border hidden border-r md:block"
        aria-label="Docs navigation"
      >
        <div
          class="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-6 pr-3"
        >
          <app-docs-sidebar />
        </div>
      </aside>

      <article class="mb-12 min-w-0 py-8 md:px-8 md:py-10">
        <ng-content />
      </article>

      <aside class="hidden xl:block" aria-label="On this page">
        <div
          class="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pl-4"
        >
          <ng-content select="[slot=toc]" />
        </div>
      </aside>
    </div>
  `,
})
export class DocsShellComponent {}
