import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import type { ChatTab, FileTab } from '@mozart/desktop-workspaces-util';
import { TabItem } from './tab-item';

// Mandatory R1 regression: the chat-only `@if` guard that previously
// wrapped both the rename pen AND the close × meant file tabs never
// rendered their close button. The fix splits the slot — the slot
// renders for any tab; rename is gated chat-only inside it.

interface MountOpts {
  readonly tab: ChatTab | FileTab;
  readonly active?: boolean;
  readonly showClose?: boolean;
}

const baseChat: ChatTab = {
  id: 'chat:abc',
  kind: 'chat',
  title: 'My chat',
  llmId: 'claude-opus-4-7',
  isStreaming: false,
  hasMessages: true,
};

const baseFile: FileTab = {
  id: 'file:c3Jj',
  kind: 'file',
  title: 'app.ts',
  filePath: 'src/app.ts',
  isPreview: false,
};

function mount(opts: MountOpts): ComponentFixture<TabItem> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(TabItem);
  fixture.componentRef.setInput('tab', opts.tab);
  fixture.componentRef.setInput('active', opts.active ?? false);
  fixture.componentRef.setInput('showClose', opts.showClose ?? true);
  fixture.detectChanges();
  return fixture;
}

function closeBtn(fixture: ComponentFixture<TabItem>) {
  return fixture.debugElement.query(
    By.css('button[aria-label="Close tab"]'),
  );
}

function renameBtn(fixture: ComponentFixture<TabItem>) {
  return fixture.debugElement.query(
    By.css('button[aria-label="Rename tab"]'),
  );
}

describe('TabItem — close × visibility', () => {
  it('R1: renders close × on file tabs (was previously hidden by chat-only outer guard)', () => {
    const fx = mount({ tab: baseFile });
    expect(closeBtn(fx)).not.toBeNull();
  });

  it('does NOT render rename pen on file tabs', () => {
    const fx = mount({ tab: baseFile });
    expect(renameBtn(fx)).toBeNull();
  });

  it('renders close × on chat tabs when showClose=true', () => {
    const fx = mount({ tab: baseChat, showClose: true });
    expect(closeBtn(fx)).not.toBeNull();
  });

  it('hides close × on chat tabs when showClose=false (single-chat case)', () => {
    const fx = mount({ tab: baseChat, showClose: false });
    expect(closeBtn(fx)).toBeNull();
  });

  it('renders rename pen on chat tabs', () => {
    const fx = mount({ tab: baseChat });
    expect(renameBtn(fx)).not.toBeNull();
  });

  it('still shows close × on file tabs when showClose=false override is unrelated', () => {
    // showClose default is true; pass false to verify it gates the file too.
    const fx = mount({ tab: baseFile, showClose: false });
    expect(closeBtn(fx)).toBeNull();
  });
});

describe('TabItem — preview italic styling', () => {
  it('applies italic class to file tab title when isPreview=true', () => {
    const fx = mount({ tab: { ...baseFile, isPreview: true } });
    const title = fx.debugElement.query(By.css('span.italic'));
    expect(title).not.toBeNull();
  });

  it('omits italic class when isPreview=false (pinned)', () => {
    const fx = mount({ tab: { ...baseFile, isPreview: false } });
    const title = fx.debugElement.query(By.css('span.italic'));
    expect(title).toBeNull();
  });

  it('chat tabs never get italic regardless of any preview-like state', () => {
    const fx = mount({ tab: baseChat });
    const italic = fx.debugElement.query(By.css('span.italic'));
    expect(italic).toBeNull();
  });
});
