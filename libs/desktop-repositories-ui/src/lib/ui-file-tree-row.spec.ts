import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { describe, expect, it, vi } from 'vitest';
import { FileTreeRow } from './ui-file-tree-row';

const fileNode: FileNode = {
  path: 'src/app.ts',
  name: 'app.ts',
  kind: 'file',
  status: 'unchanged',
  ignored: false,
};

const folderNode: FileNode = {
  path: 'src',
  name: 'src',
  kind: 'directory',
  status: 'unchanged',
  ignored: false,
  children: [],
};

function mount(
  node: FileNode,
  isFolder: boolean,
): ComponentFixture<FileTreeRow> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(FileTreeRow);
  fixture.componentRef.setInput('node', node);
  fixture.componentRef.setInput('isFolder', isFolder);
  fixture.detectChanges();
  return fixture;
}

describe('FileTreeRow — fileDoubleClick output', () => {
  it('emits fileDoubleClick on native dblclick of a file row', () => {
    const fx = mount(fileNode, false);
    const listener = vi.fn();
    fx.componentInstance.fileDoubleClick.subscribe(listener);

    const btn = fx.debugElement.query(By.css('button'));
    btn.nativeElement.dispatchEvent(new MouseEvent('dblclick'));

    expect(listener).toHaveBeenCalledWith(fileNode);
  });

  it('does NOT emit fileDoubleClick on dblclick of a folder row', () => {
    const fx = mount(folderNode, true);
    const listener = vi.fn();
    fx.componentInstance.fileDoubleClick.subscribe(listener);

    const btn = fx.debugElement.query(By.css('button'));
    btn.nativeElement.dispatchEvent(new MouseEvent('dblclick'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('still emits fileClick on single click of a file row', () => {
    const fx = mount(fileNode, false);
    const listener = vi.fn();
    fx.componentInstance.fileClick.subscribe(listener);

    const btn = fx.debugElement.query(By.css('button'));
    btn.nativeElement.dispatchEvent(new MouseEvent('click'));

    expect(listener).toHaveBeenCalledWith(fileNode);
  });
});
