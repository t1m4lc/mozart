import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  MzHunkExpandBar,
  type HunkExpandDirection,
  type HunkExpandEvent,
} from './mz-hunk-expand-bar';

function mount(opts: {
  direction?: HunkExpandDirection;
  linesAvailable: number;
  step?: number;
}): {
  fixture: ComponentFixture<MzHunkExpandBar>;
  emitted: HunkExpandEvent[];
} {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MzHunkExpandBar);
  fixture.componentRef.setInput('linesAvailable', opts.linesAvailable);
  if (opts.direction) fixture.componentRef.setInput('direction', opts.direction);
  if (opts.step !== undefined) fixture.componentRef.setInput('step', opts.step);
  const emitted: HunkExpandEvent[] = [];
  fixture.componentInstance.expand.subscribe((e) => emitted.push(e));
  fixture.detectChanges();
  return { fixture, emitted };
}

function buttons(fixture: ComponentFixture<MzHunkExpandBar>): HTMLButtonElement[] {
  return fixture.debugElement
    .queryAll(By.css('button'))
    .map((d) => d.nativeElement as HTMLButtonElement);
}

describe('MzHunkExpandBar', () => {
  describe('direction', () => {
    it('renders only the up button when direction=up', () => {
      const { fixture } = mount({ direction: 'up', linesAvailable: 10 });
      const btns = buttons(fixture);
      expect(btns).toHaveLength(1);
      expect(btns[0].getAttribute('aria-label')).toMatch(/above/i);
    });

    it('renders only the down button when direction=down', () => {
      const { fixture } = mount({ direction: 'down', linesAvailable: 10 });
      const btns = buttons(fixture);
      expect(btns).toHaveLength(1);
      expect(btns[0].getAttribute('aria-label')).toMatch(/below/i);
    });

    it('renders both buttons when direction=both', () => {
      const { fixture } = mount({ direction: 'both', linesAvailable: 10 });
      expect(buttons(fixture)).toHaveLength(2);
    });

    it('defaults to direction=both', () => {
      const { fixture } = mount({ linesAvailable: 10 });
      expect(buttons(fixture)).toHaveLength(2);
    });
  });

  describe('emit', () => {
    it('emits step count on a normal click', () => {
      const { fixture, emitted } = mount({
        direction: 'both',
        linesAvailable: 100,
        step: 10,
      });
      buttons(fixture)[0].click();
      expect(emitted).toEqual([{ direction: 'up', count: 10 }]);
    });

    it('doubles the step on shift-click', () => {
      const { fixture, emitted } = mount({
        direction: 'both',
        linesAvailable: 100,
        step: 10,
      });
      buttons(fixture)[1].dispatchEvent(new MouseEvent('click', { shiftKey: true }));
      expect(emitted).toEqual([{ direction: 'down', count: 20 }]);
    });

    it('caps count at linesAvailable when the step exceeds it', () => {
      const { fixture, emitted } = mount({
        direction: 'both',
        linesAvailable: 4,
        step: 10,
      });
      buttons(fixture)[0].click();
      expect(emitted).toEqual([{ direction: 'up', count: 4 }]);
    });

    it('caps shift-click at linesAvailable too', () => {
      const { fixture, emitted } = mount({
        direction: 'both',
        linesAvailable: 7,
        step: 10,
      });
      buttons(fixture)[1].dispatchEvent(new MouseEvent('click', { shiftKey: true }));
      expect(emitted).toEqual([{ direction: 'down', count: 7 }]);
    });
  });

  describe('disabled state', () => {
    it('disables both buttons when linesAvailable=0', () => {
      const { fixture } = mount({ direction: 'both', linesAvailable: 0 });
      const btns = buttons(fixture);
      expect(btns[0].disabled).toBe(true);
      expect(btns[1].disabled).toBe(true);
    });

    it('does not emit when buttons are disabled and click is forced', () => {
      const { fixture, emitted } = mount({ direction: 'both', linesAvailable: 0 });
      const btns = buttons(fixture);
      // Click goes through the host but emit() guards on count <= 0.
      btns[0].dispatchEvent(new MouseEvent('click'));
      btns[1].dispatchEvent(new MouseEvent('click'));
      expect(emitted).toEqual([]);
    });
  });
});
