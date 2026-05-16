import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FaqComponent } from './_partials/faq.component';
import { FinalCtaComponent } from './_partials/final-cta.component';
import { FlowComponent } from './_partials/flow.component';
import { HeroComponent } from './_partials/hero.component';
import { HowItWorksComponent } from './_partials/how-it-works.component';
import { ScreenshotComponent } from './_partials/screenshot.component';
import { TestimonialsComponent } from './_partials/testimonials.component';
import { TrustedByComponent } from './_partials/trusted-by.component';

@Component({
  selector: 'app-home',
  imports: [
    HeroComponent,
    ScreenshotComponent,
    TrustedByComponent,
    TestimonialsComponent,
    HowItWorksComponent,
    FlowComponent,
    FaqComponent,
    FinalCtaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-hero />
    <app-screenshot />
    <app-trusted-by />
    <app-testimonials />
    <app-how-it-works />
    <app-flow />
    <app-faq />
    <app-final-cta />
  `,
})
export default class HomePage {}
