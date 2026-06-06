import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import {
  skillToDescriptor,
  type DiscoveredSkill,
  type SkillDescriptor,
} from '@mozart/desktop-skills-util';

// Port for discovering skills for the active provider, scoped to a project.
// The Tauri impl (`commands.listSkills`) is bound in app composition; kept
// abstract so this data-access lib stays Tauri-free and unit-testable with a
// fake. The frontend passes stable ids (provider + projectId) — never a path.
export interface SkillsPort {
  /** Skills for `provider` (`claude`/`codex`), plus the project's repo-local
   *  skills when `projectId` is non-null. */
  list(
    provider: string,
    projectId: string | null,
  ): Promise<readonly DiscoveredSkill[]>;
}

export const SKILLS_PORT = new InjectionToken<SkillsPort>('SKILLS_PORT');

/** Per-scope discovery state. `descriptors` is what the composer renders. */
export interface SkillsState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  readonly descriptors: readonly SkillDescriptor[];
  readonly error?: string;
}

const IDLE: SkillsState = { status: 'idle', descriptors: [] };

/** Cache key. Discovery scope is (provider, project), not worktree. */
function scopeKey(provider: string, projectId: string | null): string {
  return `${provider}::${projectId ?? ''}`;
}

/**
 * Caches discovered skills per (provider, project). The filesystem scan is the
 * expensive part, so it runs once per scope and the open slash menu reads the
 * cache. Refresh triggers are deliberately narrow: switching provider/project
 * into an unseen scope (`load`), an error retry (`load` again), or an explicit
 * `refresh()` (file changed on disk / user action). Maps the wire shape to the
 * UI descriptor via the single `skillToDescriptor` bridge.
 *
 *   load(p, id)    → cached? no-op : fetch        (dedupes in-flight + loaded)
 *   refresh(p, id) → always re-fetch
 *   skillsFor(p,id)→ reactive descriptors ([] until loaded)
 */
@Injectable({ providedIn: 'root' })
export class SkillsStore {
  // Optional so unit tests / non-Tauri contexts work without a backend.
  private readonly port = inject(SKILLS_PORT, { optional: true });

  private readonly _byScope = signal<ReadonlyMap<string, SkillsState>>(
    new Map(),
  );

  /** Discovery state for a scope (idle until first `load`). */
  stateFor(provider: string, projectId: string | null): SkillsState {
    return this._byScope().get(scopeKey(provider, projectId)) ?? IDLE;
  }

  /** Descriptors for a scope; `[]` until loaded. Reactive. */
  skillsFor(
    provider: string,
    projectId: string | null,
  ): readonly SkillDescriptor[] {
    return this.stateFor(provider, projectId).descriptors;
  }

  /** Fetch once per scope. A cached or in-flight scope is a no-op; an errored
   *  scope retries. */
  async load(provider: string, projectId: string | null): Promise<void> {
    const existing = this._byScope().get(scopeKey(provider, projectId));
    if (existing && existing.status !== 'error') return;
    await this._fetch(provider, projectId);
  }

  /** Force a re-scan regardless of cache (disk changed / manual refresh). */
  async refresh(provider: string, projectId: string | null): Promise<void> {
    await this._fetch(provider, projectId);
  }

  private async _fetch(
    provider: string,
    projectId: string | null,
  ): Promise<void> {
    if (!this.port) return;
    // Keep prior descriptors visible while re-scanning so the menu doesn't blink.
    this._patch(provider, projectId, {
      status: 'loading',
      descriptors: this.skillsFor(provider, projectId),
    });
    try {
      const wire = await this.port.list(provider, projectId);
      this._patch(provider, projectId, {
        status: 'loaded',
        descriptors: wire.map(skillToDescriptor),
      });
    } catch (err) {
      this._patch(provider, projectId, {
        status: 'error',
        descriptors: [],
        error: err instanceof Error ? err.message : String(err),
      });
      console.warn('[skills] discovery failed:', err);
    }
  }

  private _patch(
    provider: string,
    projectId: string | null,
    state: SkillsState,
  ): void {
    const next = new Map(this._byScope());
    next.set(scopeKey(provider, projectId), state);
    this._byScope.set(next);
  }
}
