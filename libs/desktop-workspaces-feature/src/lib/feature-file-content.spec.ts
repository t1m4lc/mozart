import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTheme } from '@mozart/shared-util-theme';
import { describe, expect, it, vi } from 'vitest';

import {
  FileTabsService,
  ScrollPositionService,
  WorkspaceMutationsFacade,
} from '@mozart/desktop-workspaces-data-access';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';

import { FeatureFileContent } from './feature-file-content';

// jsdom doesn't implement matchMedia; CodeMirror's ThemeService bridge
// reaches for it during construction. Stub once before any TestBed mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

interface UiStateStub {
  fileViewStateFor: ReturnType<typeof vi.fn>;
  upsertFileView: ReturnType<typeof vi.fn>;
  readEdit: ReturnType<typeof vi.fn>;
  writeEdit: ReturnType<typeof vi.fn>;
  clearEdit: ReturnType<typeof vi.fn>;
}

function makeUiState(): UiStateStub {
  // Default to 'edit' so the edit-mode header renders directly. The
  // mz-code-editor lives inside an @defer block which stays as the
  // placeholder under jsdom (no viewport trigger fires), keeping
  // CodeMirror deps out of the spec.
  const state = signal({ mode: 'edit' as const, splitDiff: false });
  return {
    fileViewStateFor: vi.fn(() => state),
    upsertFileView: vi.fn(),
    readEdit: vi.fn(() => null),
    writeEdit: vi.fn(),
    clearEdit: vi.fn(),
  };
}

async function mount(opts: {
  uiState?: UiStateStub;
  workspaceId?: string | null;
  filePath?: string | null;
  canEdit?: boolean;
}): Promise<{
  fixture: ComponentFixture<FeatureFileContent>;
  uiState: UiStateStub;
}> {
  const uiState = opts.uiState ?? makeUiState();
  await TestBed.configureTestingModule({
    imports: [FeatureFileContent],
    providers: [
      {
        provide: RepositoriesFacade,
        useValue: {
          loadFile: vi.fn(async () => ''),
          saveFile: vi.fn(async () => ''),
          loadFileDiff: vi.fn(async () => ''),
          cachedChangedFilesFor: vi.fn(() => computed(() => null)),
          watcherTickFor: vi.fn(() => computed(() => 0)),
        },
      },
      { provide: UiStateFacade, useValue: uiState },
      {
        provide: ScrollPositionService,
        useValue: { recall: vi.fn(() => null), remember: vi.fn() },
      },
      {
        provide: FileTabsService,
        useValue: { findTab: vi.fn(() => null), pinForPath: vi.fn() },
      },
      {
        provide: WorkspaceMutationsFacade,
        useValue: { softRefreshAfterMutation: vi.fn() },
      },
      {
        provide: FileViewsFacade,
        useValue: {
          entryFor: vi.fn(() => undefined),
          markViewed: vi.fn(async () => undefined),
          clearViewed: vi.fn(async () => undefined),
        },
      },
      provideTheme(),
      provideZonelessChangeDetection(),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(FeatureFileContent);
  fixture.componentRef.setInput('workspaceId', opts.workspaceId ?? 'ws1');
  fixture.componentRef.setInput('filePath', opts.filePath ?? 'src/foo.ts');
  fixture.componentRef.setInput('canEdit', opts.canEdit ?? true);
  fixture.detectChanges();
  return { fixture, uiState };
}

describe('FeatureFileContent — edit-mode header (P1.4)', () => {
  it('mounts a MzFileTabHeader with the file path projected in', async () => {
    const { fixture } = await mount({ filePath: 'src/foo.ts' });
    expect(
      fixture.debugElement.query(By.css('mz-file-tab-header')),
    ).toBeTruthy();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('src/foo.ts');
  });

  it('renders both Diff and Edit toggle buttons in the header actions slot', () => {
    return mount({}).then(({ fixture }) => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const labels = buttons.map((b) =>
        (b.nativeElement.textContent ?? '').trim(),
      );
      expect(labels.some((l) => l.includes('Diff'))).toBe(true);
      expect(labels.some((l) => l.includes('Edit'))).toBe(true);
    });
  });

  // P1.4 D5 regression — Viewed is a review-of-changes concept and lives
  // only in MzFileDiffCard's header (Diff mode). The edit-mode header
  // must NOT carry it.
  it('does NOT render a Viewed button in the header (D5)', async () => {
    const { fixture } = await mount({});
    const buttons = fixture.debugElement.queryAll(By.css('button'));
    const labels = buttons.map((b) =>
      (b.nativeElement.textContent ?? '').trim(),
    );
    expect(labels.some((l) => l.includes('Viewed'))).toBe(false);
  });

  it('clicking the Edit toggle calls upsertFileView with mode=edit', async () => {
    const { fixture, uiState } = await mount({
      workspaceId: 'wsA',
      filePath: 'lib/bar.ts',
    });

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    const editBtn = buttons.find(
      (b) => (b.nativeElement.textContent ?? '').trim() === 'Edit',
    );
    if (!editBtn) throw new Error('expected Edit toggle');
    editBtn.nativeElement.click();
    fixture.detectChanges();

    expect(uiState.upsertFileView).toHaveBeenCalledWith('wsA', 'lib/bar.ts', {
      mode: 'edit',
    });
  });

  it('disables the Edit toggle when canEdit=false (frozen workspace)', async () => {
    const { fixture } = await mount({ canEdit: false });
    const buttons = fixture.debugElement.queryAll(By.css('button'));
    const editBtn = buttons.find(
      (b) => (b.nativeElement.textContent ?? '').trim() === 'Edit',
    );
    if (!editBtn) throw new Error('expected Edit toggle');
    expect((editBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
  });
});

// Regression — see commit message. `editorValue` used to be a
// `linkedSignal` whose computation read `uiState.readEdit(...)`. That
// read tracked the `_dirtyEdits` writable signal, so the post-save
// `clearEdit()` snapped the buffer back to `''` and wiped the editor.
// The fix makes `editorValue` a plain signal seeded by an effect on
// (workspace, path) via `untracked`. This test guards against a
// regression.
describe('FeatureFileContent — save preserves editor buffer', () => {
  it('does NOT wipe editorValue when save() clears the dirty-edits map', async () => {
    const saveFile = vi.fn(async () => 'new-hash');
    await TestBed.configureTestingModule({
      imports: [FeatureFileContent],
      providers: [
        {
          provide: RepositoriesFacade,
          useValue: {
            loadFile: vi.fn(async () => ''),
            saveFile,
            loadFileDiff: vi.fn(async () => ''),
            cachedChangedFilesFor: vi.fn(() => computed(() => null)),
            watcherTickFor: vi.fn(() => computed(() => 0)),
          },
        },
        { provide: UiStateFacade, useValue: makeUiState() },
        {
          provide: ScrollPositionService,
          useValue: { recall: vi.fn(() => null), remember: vi.fn() },
        },
        {
          provide: FileTabsService,
          useValue: { findTab: vi.fn(() => null), pinForPath: vi.fn() },
        },
        {
          provide: WorkspaceMutationsFacade,
          useValue: { softRefreshAfterMutation: vi.fn() },
        },
        {
          provide: FileViewsFacade,
          useValue: {
            entryFor: vi.fn(() => undefined),
            markViewed: vi.fn(async () => undefined),
            clearViewed: vi.fn(async () => undefined),
          },
        },
        provideTheme(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeatureFileContent);
    fixture.componentRef.setInput('workspaceId', 'ws1');
    fixture.componentRef.setInput('filePath', 'src/foo.ts');
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    // Bypass the deferred CodeMirror editor — simulate a user edit
    // directly through the protected method the editor would call.
    const instance = fixture.componentInstance as unknown as {
      onEditorChange: (next: string) => void;
      save: () => Promise<void>;
      editorValue: { (): string };
    };

    instance.onEditorChange('hello world');
    fixture.detectChanges();
    expect(instance.editorValue()).toBe('hello world');

    await instance.save();
    fixture.detectChanges();

    // Critical assertion: the editor buffer survives save().
    expect(instance.editorValue()).toBe('hello world');
    // And the content actually reached the persistence call.
    expect(saveFile).toHaveBeenCalledWith('ws1', 'src/foo.ts', 'hello world', '');
  });
});
