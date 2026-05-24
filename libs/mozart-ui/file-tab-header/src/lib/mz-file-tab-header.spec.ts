import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MzFileTabHeader } from './mz-file-tab-header';

@Component({
  selector: 'mz-test-host',
  imports: [MzFileTabHeader],
  template: `
    <mz-file-tab-header>
      @if (showLeading()) {
        <span mzFileTabHeaderLeading data-testid="leading">L</span>
      }
      <span data-testid="path">{{ path() }}</span>
      @if (showActions()) {
        <button mzFileTabHeaderActions type="button" data-testid="action">
          A
        </button>
      }
    </mz-file-tab-header>
  `,
})
class TestHost {
  readonly path = signal<string>('src/foo.ts');
  readonly showLeading = signal<boolean>(false);
  readonly showActions = signal<boolean>(false);
}

function mount(): ComponentFixture<TestHost> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  return fixture;
}

function findBySlot(
  fixture: ComponentFixture<unknown>,
  slot: string,
): HTMLElement | null {
  const node = fixture.debugElement.query(By.css(`[data-slot="${slot}"]`));
  return node ? (node.nativeElement as HTMLElement) : null;
}

describe('MzFileTabHeader — layout', () => {
  it('renders a single <header> with the expected baseline classes', () => {
    const fixture = mount();
    const header = findBySlot(fixture, 'file-tab-header');
    if (!header) throw new Error('expected header element');
    expect(header.tagName.toLowerCase()).toBe('header');
    expect(header.classList).toContain('h-8');
    expect(header.classList).toContain('border-b');
    expect(header.classList).toContain('flex');
    expect(header.classList).toContain('items-center');
  });

  it('renders the path slot with min-width 0 + truncate + mono typography', () => {
    const fixture = mount();
    const pathSlot = findBySlot(fixture, 'file-tab-header-path');
    if (!pathSlot) throw new Error('expected path slot');
    expect(pathSlot.classList).toContain('min-w-0');
    expect(pathSlot.classList).toContain('flex-1');
    expect(pathSlot.classList).toContain('truncate');
    expect(pathSlot.classList).toContain('font-mono');
  });
});

describe('MzFileTabHeader — projection', () => {
  it('projects default-slot content into the path region', () => {
    const fixture = mount();
    const pathSlot = findBySlot(fixture, 'file-tab-header-path');
    if (!pathSlot) throw new Error('expected path slot');
    expect(pathSlot.textContent ?? '').toContain('src/foo.ts');
  });

  it('updates when the projected path content changes', () => {
    const fixture = mount();
    fixture.componentInstance.path.set('other/bar.rs');
    fixture.detectChanges();
    const pathSlot = findBySlot(fixture, 'file-tab-header-path');
    if (!pathSlot) throw new Error('expected path slot');
    expect(pathSlot.textContent ?? '').toContain('other/bar.rs');
  });

  it('projects the leading slot when present', () => {
    const fixture = mount();
    expect(
      fixture.debugElement.query(By.css('[data-testid="leading"]')),
    ).toBeNull();

    fixture.componentInstance.showLeading.set(true);
    fixture.detectChanges();

    const leading = fixture.debugElement.query(
      By.css('[data-testid="leading"]'),
    );
    expect(leading).toBeTruthy();
    expect(
      (leading.nativeElement as HTMLElement).hasAttribute(
        'mzFileTabHeaderLeading',
      ),
    ).toBe(true);
  });

  it('projects the actions slot when present', () => {
    const fixture = mount();
    expect(
      fixture.debugElement.query(By.css('[data-testid="action"]')),
    ).toBeNull();

    fixture.componentInstance.showActions.set(true);
    fixture.detectChanges();

    const action = fixture.debugElement.query(By.css('[data-testid="action"]'));
    expect(action).toBeTruthy();
    expect(
      (action.nativeElement as HTMLElement).hasAttribute(
        'mzFileTabHeaderActions',
      ),
    ).toBe(true);
  });

  it('renders with no leading and no actions when callers omit them', () => {
    const fixture = mount();
    expect(
      fixture.debugElement.query(By.css('[data-testid="leading"]')),
    ).toBeNull();
    expect(
      fixture.debugElement.query(By.css('[data-testid="action"]')),
    ).toBeNull();
    // Path region still renders.
    expect(findBySlot(fixture, 'file-tab-header-path')).toBeTruthy();
  });
});
