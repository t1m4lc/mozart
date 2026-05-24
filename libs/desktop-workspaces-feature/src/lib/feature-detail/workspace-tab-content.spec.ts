import type { Navigation } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { extractIntent } from './workspace-tab-content';

// Intent encoding (D-r2). The full dispatch effect is integration-
// heavy (Router events + ChatFacade + FileTabsService); the encoding
// helper is the only piece of logic worth a tight unit test. Service
// calls (previewForPath/pinForPath/setActiveChat) are covered in
// `file-tabs.service.spec.ts` and exercised end-to-end manually.

function nav(extras?: Navigation['extras']): Navigation {
  return { extras: extras ?? {} } as Navigation;
}

describe('extractIntent', () => {
  it("returns 'preview' when state.intent === 'preview'", () => {
    expect(extractIntent(nav({ state: { intent: 'preview' } }))).toBe(
      'preview',
    );
  });

  it("returns 'pin' when state.intent is absent", () => {
    expect(extractIntent(nav({}))).toBe('pin');
  });

  it("returns 'pin' when navigation is null (first paint / no prior nav)", () => {
    expect(extractIntent(null)).toBe('pin');
  });

  it("returns 'pin' for any non-'preview' state.intent value (defensive)", () => {
    expect(extractIntent(nav({ state: { intent: 'something' } }))).toBe('pin');
    expect(extractIntent(nav({ state: { intent: 42 } }))).toBe('pin');
  });

  it("returns 'pin' when state has no intent property", () => {
    expect(extractIntent(nav({ state: { other: 'value' } }))).toBe('pin');
  });
});
