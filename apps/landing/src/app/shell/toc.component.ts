import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTextAlignStart } from '@ng-icons/lucide';
import { filter } from 'rxjs/operators';
import type { TocHeading } from './toc';

@Component({
  selector: 'app-toc',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideTextAlignStart })],
  host: { class: 'block' },
  template: `
    @if (headings().length > 0) {
      <nav aria-labelledby="toc-title" class="flex flex-col">
        <h3
          id="toc-title"
          class="text-foreground/70 inline-flex items-center gap-1.5 text-sm"
        >
          <ng-icon
            hlm
            size="sm"
            name="lucideTextAlignStart"
            aria-hidden="true"
          />
          On this page
        </h3>
        <div class="relative mt-3">
          <div
            class="bg-border pointer-events-none absolute top-0 left-2 w-px"
            [style.height.px]="listHeight()"
            aria-hidden="true"
          ></div>
          @if (activeMetrics(); as m) {
            <div
              class="bg-primary pointer-events-none absolute left-2 w-px transition-all duration-200"
              [style.top.px]="m.top"
              [style.height.px]="m.height"
              aria-hidden="true"
            ></div>
            <div
              class="bg-primary pointer-events-none absolute size-1 -translate-x-px rounded-full transition-all duration-200"
              [style.top.px]="m.dotTop"
              [style.left.px]="8"
              aria-hidden="true"
            ></div>
          }
          <ol #list class="scrollbar-hide flex flex-col text-sm">
            @for (h of headings(); track h.id) {
              <li>
                <a
                  #anchor
                  [href]="'#' + h.id"
                  (click)="onClick($event, h.id)"
                  [attr.data-active]="activeId() === h.id"
                  [attr.data-id]="h.id"
                  class="text-foreground/60 hover:text-foreground data-[active=true]:text-primary block py-1.5 transition-colors"
                  [class.pl-5]="h.level === 2"
                  [class.pl-9]="h.level === 3"
                >
                  {{ h.text }}
                </a>
              </li>
            }
          </ol>
        </div>
      </nav>
    }
  `,
})
export class TocComponent implements AfterViewInit {
  readonly headings = input.required<readonly TocHeading[]>();
  /** Selector of the element whose headings should be observed for scroll-spy. */
  readonly scrollTargetSelector = input<string>('article');

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly anchorEls =
    viewChildren<ElementRef<HTMLAnchorElement>>('anchor');
  private readonly listEl = viewChildren<ElementRef<HTMLElement>>('list');

  protected readonly activeId = signal<string>('');
  private readonly layoutTick = signal(0);
  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;

  protected readonly listHeight = computed(() => {
    this.layoutTick();
    const list = this.listEl()[0]?.nativeElement;
    return list?.offsetHeight ?? 0;
  });

  protected readonly activeMetrics = computed(() => {
    this.layoutTick();
    const id = this.activeId();
    if (!id) return null;
    const anchor = this.anchorEls().find(
      (a) => a.nativeElement.dataset['id'] === id,
    );
    if (!anchor) return null;
    const el = anchor.nativeElement;
    const top = el.offsetTop;
    const height = el.offsetHeight;
    return { top, height, dotTop: top + height / 2 - 2 };
  });

  constructor() {
    effect(() => {
      const list = this.headings();
      this.activeId.set(list[0]?.id ?? '');
      queueMicrotask(() => {
        this.observeHeadings();
        this.layoutTick.update((v) => v + 1);
      });
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() =>
        queueMicrotask(() => {
          this.observeHeadings();
          this.layoutTick.update((v) => v + 1);
        }),
      );

    const list = this.listEl()[0]?.nativeElement;
    if (list && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() =>
        this.layoutTick.update((v) => v + 1),
      );
      this.resizeObserver.observe(list);
      this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
    }
  }

  protected onClick(event: MouseEvent, id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    this.activeId.set(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  }

  private observeHeadings(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.observer?.disconnect();
    const ids = this.headings().map((h) => h.id);
    if (ids.length === 0) return;
    const target = document.querySelector(this.scrollTargetSelector());
    if (!target) return;
    const elements = ids
      .map((id) => target.querySelector<HTMLElement>(`#${CSS.escape(id)}`))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top,
          )[0];
        if (visible) this.activeId.set(visible.target.id);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: [0, 1] },
    );
    for (const el of elements) this.observer.observe(el);
  }
}
