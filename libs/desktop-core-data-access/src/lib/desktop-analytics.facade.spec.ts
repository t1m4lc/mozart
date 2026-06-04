import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from '@mozart/shared-util-analytics';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsConfigPort } from './analytics-config.port';
import { DesktopAnalyticsFacade } from './desktop-analytics.facade';

// Locks in the consent chokepoint (P1 acceptance criteria): every desktop
// capture goes through track() and is gated on telemetry_opt_in, capture()
// is never reached when opted out, and identify carries the install_id.

describe('DesktopAnalyticsFacade', () => {
  const analytics = {
    init: vi.fn().mockResolvedValue(undefined),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  };

  function configReturning(optIn: boolean) {
    return {
      getOrCreateInstallId: vi.fn().mockResolvedValue('install-123'),
      getTelemetryOptIn: vi.fn().mockResolvedValue(optIn),
      setTelemetryOptIn: vi.fn().mockResolvedValue(undefined),
    };
  }

  function setup(optIn: boolean): DesktopAnalyticsFacade {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalyticsService, useValue: analytics },
        { provide: AnalyticsConfigPort, useValue: configReturning(optIn) },
      ],
    });
    return TestBed.inject(DesktopAnalyticsFacade);
  }

  beforeEach(() => {
    analytics.init.mockClear();
    analytics.capture.mockClear();
    analytics.identify.mockClear();
    analytics.reset.mockClear();
    TestBed.resetTestingModule();
  });

  it('inits PostHog with the install_id as the bootstrap distinct_id when opted in', async () => {
    const facade = setup(true);
    await facade.bootstrap();
    expect(analytics.init).toHaveBeenCalledWith({
      bootstrapDistinctId: 'install-123',
    });
  });

  it('captures through track() with surface=desktop when opted in', async () => {
    const facade = setup(true);
    await facade.bootstrap();
    facade.track('workspace_created', { is_first: true });
    expect(analytics.capture).toHaveBeenCalledWith('workspace_created', {
      surface: 'desktop',
      is_first: true,
    });
  });

  it('never inits or captures when opted out (consent gate)', async () => {
    const facade = setup(false);
    await facade.bootstrap();
    facade.track('agent_completed', { outcome: 'succeeded' });
    expect(analytics.init).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('identifies with the install_id and resets on logout', async () => {
    const facade = setup(true);
    await facade.bootstrap();
    facade.identifyUser('user_abc');
    expect(analytics.identify).toHaveBeenCalledWith('user_abc', {
      install_id: 'install-123',
    });
    facade.reset();
    expect(analytics.reset).toHaveBeenCalled();
  });
});
