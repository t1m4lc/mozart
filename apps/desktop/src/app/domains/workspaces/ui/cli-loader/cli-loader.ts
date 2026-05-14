import { ChangeDetectionStrategy, Component } from '@angular/core';

// Terminal-style "loading" indicator: three dots blinking in sequence
// (40%-up, 60%-down). Color inherits from text-current so call sites
// pick the tint (text-brand for streaming, text-muted-foreground for
// background installs, …). Sized 12px square with 3px dots so it
// drops in wherever a 12-16px icon lives in the sidebar.
@Component({
  selector: 'app-cli-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-flex size-3 shrink-0 items-center justify-center gap-[2px]',
    role: 'status',
    'aria-label': 'Loading',
  },
  template: `
    <span class="cli-dot"></span>
    <span class="cli-dot cli-dot-2"></span>
    <span class="cli-dot cli-dot-3"></span>
  `,
  styles: `
    :host { line-height: 0; }
    .cli-dot {
      display: inline-block;
      width: 3px;
      height: 3px;
      border-radius: 9999px;
      background-color: currentColor;
      opacity: 0.3;
      animation: cli-loader-blink 1.2s infinite ease-in-out;
    }
    .cli-dot-2 { animation-delay: 0.2s; }
    .cli-dot-3 { animation-delay: 0.4s; }
    @keyframes cli-loader-blink {
      0%, 80%, 100% { opacity: 0.3; }
      40% { opacity: 1; }
    }
  `,
})
export class CliLoader {}
