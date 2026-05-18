import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowRight,
  lucideDownload,
} from '@ng-icons/lucide';
import {
  DOWNLOAD_DIALOG_CLASS,
  DownloadDialogComponent,
} from '../../shell/download-dialog.component';
import {
  ROADMAP_DIALOG_CLASS,
  RoadmapDialogComponent,
} from '../../shell/roadmap-dialog.component';

@Component({
  selector: 'app-hero',
  imports: [HlmButton, HlmIconImports, NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ lucideArrowDown, lucideArrowRight, lucideDownload }),
  ],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-xl px-4 pt-12 pb-4 sm:pb-8 sm:pt-20 sm:px-8">
      <h1
        class="text-foreground max-w-xl text-3xl font-semibold tracking-tight md:text-4xl mb-3"
      >
        Agents move <i>fast</i>. <br />
        <b>Mozart</b> gives direction.
      </h1>

      <p class="text-muted-foreground mb-8 max-w-2xl text-base">
        Run <b>parallel Agents</b> in isolated Workspaces. <br />
        Review every diff. Ship faster <b>without losing control</b>.
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          hlmBtn
          type="button"
          variant="default"
          size="lg"
          (click)="openDownload()"
          class="border-primary group justify-between shadow-brand transition-shadow duration-300 hover:shadow-brand-strong"
        >
          Download Mozart
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
        <a
          hlmBtn
          variant="outline"
          size="lg"
          routerLink="/docs"
          class="group justify-between"
        >
          Learn how it works
          <ng-icon
            hlm
            size="sm"
            name="lucideArrowRight"
            class="transition-transform duration-200 group-hover:translate-x-1"
          />
        </a>
      </div>
    </section>
  `,
})
export class HeroComponent {
  private readonly dialog = inject(HlmDialogService);

  protected openDownload(): void {
    this.dialog.open(DownloadDialogComponent, {
      contentClass: DOWNLOAD_DIALOG_CLASS,
    });
  }

  protected openRoadmap(): void {
    this.dialog.open(RoadmapDialogComponent, {
      contentClass: ROADMAP_DIALOG_CLASS,
    });
  }
}
