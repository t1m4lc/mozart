import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { RouteMeta } from '@analogjs/router';

const LAST_UPDATED = '2026-05-16';

const SECTIONS = [
  { id: 'information-we-collect', title: 'Information we collect' },
  { id: 'how-we-use-it', title: 'How we use it' },
  { id: 'sharing', title: 'Sharing' },
  { id: 'your-choices', title: 'Your choices' },
  { id: 'contact', title: 'Contact' },
] as const;

export const routeMeta: RouteMeta = {
  title: 'Privacy — Mozart',
  meta: [
    {
      name: 'description',
      content:
        'Placeholder privacy notice for Mozart. Final text is being drafted.',
    },
    { name: 'robots', content: 'noindex,nofollow' },
  ],
};

@Component({
  selector: 'app-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section
      class="font-sans mx-auto w-full max-w-3xl px-4 py-16 sm:px-8 sm:py-24"
    >
      <div
        class="border-border bg-muted text-foreground mb-12 rounded-md border px-4 py-3 text-sm"
        role="status"
      >
        <strong class="font-semibold">Placeholder.</strong>
        Not final legal text — this page will be replaced before public launch.
      </div>

      <header class="mb-12">
        <h1
          class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          Privacy
        </h1>
        <p class="text-muted-foreground mt-2 text-sm">
          Last updated {{ lastUpdated }}
        </p>
      </header>

      <div class="prose">
        @for (section of sections; track section.id) {
          <h2 [id]="section.id">{{ section.title }}</h2>
          <p>To be drafted by counsel.</p>
        }
      </div>
    </section>
  `,
})
export default class PrivacyPage {
  protected readonly lastUpdated = LAST_UPDATED;
  protected readonly sections = SECTIONS;
}
