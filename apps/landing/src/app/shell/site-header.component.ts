import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { HlmThemeToggle } from '@mozart-ui/theme-toggle';
import { OsService } from '@mozart/shared-util-os';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideChevronDown,
  lucideDownload,
  lucideMenu,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmNavigationMenuImports } from '@spartan-ui/navigation-menu';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { ANALYTICS_EVENTS, AnalyticsService } from '@mozart/shared-util-analytics';
import { detectOsTag } from './analytics/detect-os';
import { pageSection } from './analytics/page-section';
import {
  DOWNLOAD_DIALOG_CLASS,
  DOWNLOAD_DIALOG_SOURCES,
  DownloadDialogComponent,
} from './download-dialog.component';
import { PRIMARY_NAV, SOLUTIONS_NAV } from './nav-model';

function isDownloadRoute(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return path === '/' || path === '/download';
}

@Component({
  selector: 'app-site-header',
  imports: [
    HlmButton,
    HlmIconImports,
    HlmNavigationMenuImports,
    NgIcon,
    RouterLink,
    RouterLinkActive,
    HlmTooltipImports,
    HlmThemeToggle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowDown,
      lucideChevronDown,
      lucideDownload,
      lucideMenu,
      lucideX,
    }),
  ],
  host: {
    class:
      'sticky top-0 z-40 block w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
  },
  template: `
    <div
      class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
    >
      <a
        routerLink="/"
        aria-label="Mozart home"
        hlmTooltip="Mozart home"
        position="right"
        class="flex h-10 w-10 shrink-0 items-center justify-center"
      >
        <img
          src="/assets/shared/logos/mozart-logo.svg"
          alt="Mozart"
          width="40"
          height="40"
          class="h-10 w-10"
        />
      </a>

      <div class="flex min-w-0 items-center gap-3 md:gap-6">
        <nav aria-label="Primary" class="hidden items-center gap-6 md:flex">
          <nav hlmNavigationMenu aria-label="Solutions">
            <ul hlmNavigationMenuList>
              <li hlmNavigationMenuItem>
                <button
                  hlmNavigationMenuTrigger
                  type="button"
                  class="text-foreground/70 hover:text-foreground h-auto bg-transparent px-0 py-0 text-sm font-normal hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent"
                >
                  Solutions
                  <ng-icon
                    hlm
                    size="sm"
                    name="lucideChevronDown"
                    class="ml-1 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  />
                </button>
                <ng-template hlmNavigationMenuPortal>
                  <div hlmNavigationMenuContent>
                    <ul class="grid w-64 gap-1">
                      @for (link of solutions; track link.href) {
                        <li>
                          <a hlmNavigationMenuLink [routerLink]="link.href">
                            <span class="text-foreground text-sm font-medium">
                              {{ link.label }}
                            </span>
                            <span class="text-muted-foreground text-xs">
                              {{ link.description }}
                            </span>
                          </a>
                        </li>
                      }
                    </ul>
                  </div>
                </ng-template>
              </li>
            </ul>
          </nav>
          @for (link of nav; track link.href) {
            <a
              [routerLink]="link.href"
              routerLinkActive="text-foreground hover:text-foreground/70"
              [routerLinkActiveOptions]="{ exact: false }"
              class="text-foreground/70 hover:text-foreground whitespace-nowrap text-sm transition-colors"
            >
              {{ link.label }}
            </a>
          }
          @if (showDownload()) {
            <button
              hlmBtn
              type="button"
              variant="default"
              size="default"
              (click)="openDownload()"
              class="justify-between"
            >
              Download
            </button>
          }
        </nav>

        <button
          type="button"
          [attr.aria-label]="menuOpen() ? 'Close menu' : 'Open menu'"
          [attr.aria-expanded]="menuOpen()"
          (click)="toggleMenu()"
          class="border-border bg-background/65 text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md border backdrop-blur-sm transition-colors md:hidden"
        >
          <ng-icon
            hlm
            size="sm"
            [name]="menuOpen() ? 'lucideX' : 'lucideMenu'"
          />
        </button>
      </div>
    </div>

    @if (menuOpen()) {
      <div class="border-border bg-background border-t md:hidden">
        <nav
          aria-label="Mobile"
          class="mx-auto flex w-full max-w-screen-xl flex-col gap-1 px-4 py-3 sm:px-6 lg:px-8"
        >
          <span
            class="text-muted-foreground px-3 pt-1 pb-0.5 font-mono text-xs tracking-wider uppercase"
          >
            Solutions
          </span>
          @for (link of solutions; track link.href) {
            <a
              [routerLink]="link.href"
              (click)="closeMenu()"
              class="text-foreground hover:bg-muted rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              {{ link.label }}
            </a>
          }
          <div class="border-border my-2 border-t" aria-hidden="true"></div>
          @for (link of nav; track link.href) {
            <a
              [routerLink]="link.href"
              (click)="closeMenu()"
              class="text-foreground hover:bg-muted rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              {{ link.label }}
            </a>
          }
          @if (showDownload()) {
            <button
              hlmBtn
              type="button"
              variant="default"
              size="default"
              (click)="closeMenu(); openDownload()"
              class="group mt-2 justify-between"
            >
              Download
              <span class="relative h-4 w-4">
                <ng-icon
                  hlm
                  size="sm"
                  name="lucideDownload"
                  class="absolute inset-0 transition-all duration-200 group-hover:-translate-y-2 group-hover:opacity-0"
                />
                <ng-icon
                  hlm
                  size="sm"
                  name="lucideArrowDown"
                  class="absolute inset-0 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                />
              </span>
            </button>
          }
        </nav>
      </div>
    }
  `,
})
export class SiteHeaderComponent {
  protected readonly nav = PRIMARY_NAV;
  protected readonly solutions = SOLUTIONS_NAV;
  protected readonly menuOpen = signal(false);
  private readonly dialog = inject(HlmDialogService);
  private readonly analytics = inject(AnalyticsService);
  private readonly os = inject(OsService);
  private readonly router = inject(Router);

  protected readonly showDownload = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => isDownloadRoute(e.urlAfterRedirects)),
      startWith(isDownloadRoute(this.router.url)),
    ),
    { requireSync: true },
  );

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected openDownload(): void {
    const source = DOWNLOAD_DIALOG_SOURCES.header;
    const path = this.router.url.split('?')[0].split('#')[0] || '/';
    const section = pageSection(path);
    const osTag = detectOsTag(this.os);
    this.analytics.capture(ANALYTICS_EVENTS.downloadCtaClicked, {
      source,
      section,
      os: osTag,
      path,
    });
    this.dialog.open(DownloadDialogComponent, {
      contentClass: DOWNLOAD_DIALOG_CLASS,
      context: { source, section },
    });
  }
}
