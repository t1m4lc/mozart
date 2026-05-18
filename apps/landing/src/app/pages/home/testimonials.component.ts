import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBadgeCheck } from '@ng-icons/lucide';

interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  /** Unsplash CDN URL — face-cropped portrait. Falls back to initials if it fails to load. */
  readonly avatar: string;
}

// Avatars: real Unsplash portraits served from images.unsplash.com.
// Params: `auto=format` for AVIF/WebP, `crop=faces` centers the face,
// `w=160&h=160` keeps the avatar small and DPR-friendly (we render at 40px).
const UNSPLASH_PARAMS =
  'auto=format&fit=crop&crop=faces&w=160&h=160&q=80';

const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "I review 3-4 agent diffs in parallel now instead of babysitting one. Mozart is the cockpit I didn't know I needed.",
    name: 'Mara Whitfield',
    role: 'Staff Engineer, Helix Labs',
    initials: 'MW',
    avatar: `https://images.unsplash.com/photo-1494790108377-be9c29b29330?${UNSPLASH_PARAMS}`,
  },
  {
    quote:
      'Local-first changed how I trust AI. My code never leaves my laptop until I push.',
    name: 'Daniel Okafor',
    role: 'Founder, Stagewise',
    initials: 'DO',
    avatar: `https://images.unsplash.com/photo-1500648767791-00dcc994a43e?${UNSPLASH_PARAMS}`,
  },
  {
    quote:
      'Workspaces map 1:1 to my mental model — one task, one branch, one diff. Finally.',
    name: 'Priya Raman',
    role: 'Tech Lead, Northwind Mobile',
    initials: 'PR',
    avatar: `https://images.unsplash.com/photo-1438761681033-6461ffad8d80?${UNSPLASH_PARAMS}`,
  },
  {
    quote:
      'The diff view alone saved my Friday afternoon. I caught two regressions before merging.',
    name: 'Jordan Klein',
    role: 'Senior Engineer, Loop Robotics',
    initials: 'JK',
    avatar: `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?${UNSPLASH_PARAMS}`,
  },
  {
    quote:
      "Plain markdown, plain git, my agents, my keys. It just feels right.",
    name: 'Casey Lindholm',
    role: 'Product Engineer, Cartograph',
    initials: 'CL',
    avatar: `https://images.unsplash.com/photo-1531123897727-8f129e1688ce?${UNSPLASH_PARAMS}`,
  },
  {
    quote:
      'I moved from juggling 6 terminals to one timeline. The mental load drop is real.',
    name: 'Riley Tan',
    role: 'Engineering Lead, Vela',
    initials: 'RT',
    avatar: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?${UNSPLASH_PARAMS}`,
  },
] as const;

@Component({
  selector: 'app-testimonials',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideBadgeCheck })],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl py-16">
      <div class="relative md:hidden">
        <div
          aria-hidden="true"
          class="from-background pointer-events-none absolute top-0 bottom-4 left-0 z-10 w-8 bg-gradient-to-r to-transparent"
        ></div>
        <div
          aria-hidden="true"
          class="from-background pointer-events-none absolute top-0 right-0 bottom-4 z-10 w-8 bg-gradient-to-l to-transparent"
        ></div>
        <div class="scrollbar-hide overflow-x-auto px-4 pb-4">
          <ul class="flex w-max gap-4">
            @for (item of testimonials; track item.name) {
              <li
                class="border-border bg-muted/40 flex w-72 shrink-0 flex-col gap-4 rounded-lg border p-4"
              >
                <p class="text-foreground font-mono text-sm">
                  {{ item.quote }}
                </p>
                <div class="flex items-center gap-3">
                  <span
                    class="border-border bg-muted text-muted-foreground relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-medium"
                  >
                    <span aria-hidden="true">{{ item.initials }}</span>
                    <img
                      [src]="item.avatar"
                      [alt]="item.name + ' avatar'"
                      loading="lazy"
                      decoding="async"
                      width="40"
                      height="40"
                      class="absolute inset-0 h-full w-full object-cover"
                      (error)="onAvatarError($event)"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1">
                      <span
                        class="text-foreground truncate text-sm font-medium"
                      >
                        {{ item.name }}
                      </span>
                      <ng-icon
                        hlm
                        size="xs"
                        name="lucideBadgeCheck"
                        class="text-foreground shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ item.role }}
                    </p>
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      </div>

      <ul class="hidden gap-4 px-4 md:grid md:grid-cols-3 md:px-8">
        @for (item of testimonials; track item.name) {
          <li
            class="border-border bg-muted/40 flex flex-col gap-4 rounded-lg border p-4"
          >
            <p class="text-foreground text-sm">{{ item.quote }}</p>
            <div class="flex items-center gap-3">
              <span
                class="border-border bg-muted text-muted-foreground relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-medium"
              >
                <span aria-hidden="true">{{ item.initials }}</span>
                <img
                  [src]="item.avatar"
                  [alt]="item.name + ' avatar'"
                  loading="lazy"
                  decoding="async"
                  width="40"
                  height="40"
                  class="absolute inset-0 h-full w-full object-cover"
                  (error)="onAvatarError($event)"
                />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <span class="text-foreground truncate text-sm font-medium">
                    {{ item.name }}
                  </span>
                  <ng-icon
                    hlm
                    size="sm"
                    name="lucideBadgeCheck"
                    class="text-foreground shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <p class="text-muted-foreground truncate text-sm">
                  {{ item.role }}
                </p>
              </div>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class TestimonialsComponent {
  protected readonly testimonials = TESTIMONIALS;

  protected onAvatarError(event: Event): void {
    // Avatar URL failed — hide the img so the underlying initials show through.
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
