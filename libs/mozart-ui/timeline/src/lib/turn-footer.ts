import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { TurnState } from './turn-state.types';

@Component({
  selector: 'mz-turn-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (_show()) {
      <div
        class="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70"
      >
        @if (_durationLabel(); as d) {
          <span>{{ d }}</span>
        }
        @if (_durationLabel() && _tokensLabel()) {
          <span aria-hidden="true">·</span>
        }
        @if (_tokensLabel(); as t) {
          <span>{{ t }}</span>
        }
      </div>
    }
  `,
})
export class TurnFooter {
  readonly state = input.required<TurnState>();

  protected readonly _durationLabel = computed(() => {
    const ms = this.state().elapsedMs;
    if (ms == null) return '';
    return formatDuration(ms);
  });

  protected readonly _tokensLabel = computed(() => {
    const usage = this.state().usage;
    if (!usage) return '';
    const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    if (total <= 0) return '';
    return `${formatTokens(total)} tokens`;
  });

  protected readonly _show = computed(
    () => !!this._durationLabel() || !!this._tokensLabel(),
  );
}

export function formatDuration(ms: number): string {
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
