import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectSeo } from '../shell/seo';
import { FaqComponent } from './home/faq.component';
import { FinalCtaComponent } from './home/final-cta.component';
import { FlowComponent } from './home/flow.component';
import { HeroComponent } from './home/hero.component';
import { HowItWorksComponent } from './home/how-it-works.component';
import { ScreenshotComponent } from './home/screenshot.component';
import { TestimonialsComponent } from './home/testimonials.component';
import { TrustedByComponent } from './home/trusted-by.component';

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
export default class HomePage {
  private readonly seo = injectSeo();

  constructor() {
    this.seo({
      title: 'Mozart | Conduct your AI coding agents',
      description:
        'Agents play the notes. Mozart helps you conduct the masterpiece.',
      path: '/',
      type: 'website',
    });
  }
}
