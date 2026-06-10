import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OtherVerticalsComponent } from './other-verticals.component';
import type { VerticalConfig } from './vertical-config';
import { VerticalFaqComponent } from './vertical-faq.component';
import { VerticalHeroComponent } from './vertical-hero.component';
import { VerticalPainsComponent } from './vertical-pains.component';
import { VerticalPositioningComponent } from './vertical-positioning.component';
import { VerticalRoadmapComponent } from './vertical-roadmap.component';
import { VerticalWaitlistComponent } from './vertical-waitlist.component';
import { VerticalWorkflowsComponent } from './vertical-workflows.component';

@Component({
  selector: 'app-vertical-page',
  imports: [
    VerticalHeroComponent,
    VerticalPainsComponent,
    VerticalWorkflowsComponent,
    VerticalPositioningComponent,
    VerticalRoadmapComponent,
    VerticalFaqComponent,
    VerticalWaitlistComponent,
    OtherVerticalsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-vertical-hero [config]="config()" />
    <app-vertical-pains [pains]="config().pains" />
    <app-vertical-workflows [workflows]="config().workflows" />
    <app-vertical-positioning />
    <app-vertical-roadmap [integrations]="config().integrations" />
    <app-vertical-faq [faq]="config().faq" />
    <app-vertical-waitlist
      [vertical]="config().slug"
      [jobTitle]="config().jobTitle"
    />
    <app-other-verticals [current]="config().slug" />
  `,
})
export class VerticalPageComponent {
  readonly config = input.required<VerticalConfig>();
}
