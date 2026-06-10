import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOZART_LINKS } from '@mozart/shared-util-mozart-links';
import { injectSeo } from '../shell/seo';

@Component({
  selector: 'app-join-us-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section
      class="font-sans mx-auto w-full max-w-3xl px-4 py-16 sm:px-8 sm:py-24"
    >
      <header class="mb-12">
        <span
          class="bg-muted border-border text-muted-foreground mb-6 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
        >
          Join us
        </span>
        <h1
          class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          Building the cockpit for AI agents
        </h1>
        <p class="text-muted-foreground mt-3 text-lg leading-relaxed">
          Putting AI agents in the hands of everyone who works behind a
          computer, not just developers.
        </p>
      </header>

      <div class="prose">
        <h2>Our mission</h2>
        <p>
          Mozart exists to open AI agents to the people who do not have a
          developer's license. LLMs produce a new kind of intelligence: that is
          the fuel. But fuel alone gets you nowhere. To go from point A to point
          B you need a cockpit, an interface that lets anyone pilot that
          intelligence without writing a single command.
        </p>
        <blockquote>
          Today, to really pilot that intelligence, you almost always need a
          pilot's license. We are building the cockpit so you do not.
        </blockquote>
        <p>
          We are <strong>local-first and privacy-first</strong>. Your files,
          your tools, and your context stay on your machine. The goal is simple,
          almost obsessive: produce something genuinely useful for one real
          user, on their machine, with their real documents.
        </p>

        <h2>No open roles, yet</h2>
        <p>
          We are not hiring for a specific role right now. Mozart is early, and
          the team is small on purpose.
        </p>
        <p>
          But we are <strong>always listening</strong>. If you believe in this
          direction and want to help build it, a spontaneous application is
          always welcome. Tell us who you are, what you would want to work on,
          and why this mission resonates with you.
        </p>

        <h2>Get in touch</h2>
        <ul>
          <li>Join the conversation on <a href="/discord">Discord</a>.</li>
          <li>
            Or write to us on
            <a [href]="linkedin" target="_blank" rel="noopener noreferrer"
              >LinkedIn</a
            >.
          </li>
        </ul>
        <p>We read everything.</p>
      </div>
    </section>
  `,
})
export default class JoinUsPage {
  protected readonly linkedin = MOZART_LINKS.social.linkedin;

  constructor() {
    injectSeo()({
      title: 'Join us | Mozart',
      description:
        "We're building the cockpit that puts AI agents in everyone's hands. No open roles right now, but spontaneous applications are always welcome.",
      path: '/join-us',
      type: 'website',
    });
  }
}
