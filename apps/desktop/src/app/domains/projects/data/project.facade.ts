import { Injectable, computed, inject } from '@angular/core';
import { DIALOG_ADAPTER } from './dialog.adapter';
import type { Project } from './project.model';
import type { GroupBy, ProjectFilter } from './project.store';
import { ProjectStore } from './project.store';
import { PROJECTS_ADAPTER } from './projects.adapter';

// Public API of the `projects` domain. Features inject this — never
// the store directly. All mutators are optimistic-first: patch the
// store immediately, persist via Tauri, revert on failure.
@Injectable({ providedIn: 'root' })
export class ProjectsFacade {
  private readonly store = inject(ProjectStore);
  private readonly dialog = inject(DIALOG_ADAPTER);
  private readonly adapter = inject(PROJECTS_ADAPTER);

  // Buffered drag-reorder: a drop fires a 250ms timer; subsequent
  // drops during the timer reset it. Only the final ordering hits
  // Tauri. v0.0.1 has no UX for a "save indicator" yet — drops feel
  // instant.
  private reorderTimer: ReturnType<typeof setTimeout> | null = null;

  // Reads
  readonly all = this.store.projects;
  readonly visible = this.store.visibleProjects;
  readonly hoveredId = this.store.hoveredProjectId;
  readonly groupBy = this.store.groupBy;
  readonly projectFilter = this.store.projectFilter;
  readonly allProjectsSelected = this.store.allProjectsSelected;
  readonly byId = (id: string) =>
    computed(() => this.store.projects().find((p) => p.id === id) ?? null);

  isExpanded(id: string): boolean {
    return this.store.isExpanded(id);
  }

  async loadAll(): Promise<void> {
    const projects = await this.adapter.list();
    this.store.setAll(projects);
  }

  async openPickerAndAdd(): Promise<Project | null> {
    const path = await this.dialog.pickFolder();
    if (path == null) return null;
    return this.add(path);
  }

  async add(path: string): Promise<Project> {
    const project = await this.adapter.add(path);
    this.store.upsertProject(project);
    return project;
  }

  toggleExpanded(id: string): void {
    this.store.toggleExpanded(id);
  }
  setHovered(id: string | null): void {
    this.store.setHovered(id);
  }
  expandAll(): void {
    this.store.expandAll();
  }
  collapseAll(): void {
    this.store.collapseAll();
  }
  setGroupBy(group: GroupBy): void {
    this.store.setGroupBy(group);
  }
  selectAllProjects(): void {
    this.store.selectAllProjects();
  }
  toggleProjectInFilter(id: string): void {
    this.store.toggleProjectInFilter(id);
  }

  // ---- Optimistic mutators ----------------------------------------

  // Hide and rollback on Tauri failure. The previous .hide() left the
  // flag in memory only — restart un-hid the project.
  async hide(id: string): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setHidden(id, true);
    try {
      await this.adapter.setHidden(id, true);
    } catch (err) {
      this.store.setHidden(id, current.hidden);
      throw err;
    }
  }

  async unhide(id: string): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setHidden(id, false);
    try {
      await this.adapter.setHidden(id, false);
    } catch (err) {
      this.store.setHidden(id, current.hidden);
      throw err;
    }
  }

  async setIcon(id: string, icon: string | null): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setIcon(id, icon);
    try {
      await this.adapter.setIcon(id, icon);
    } catch (err) {
      this.store.setIcon(id, current.icon);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const snapshot = this.store.projects();
    this.store.removeProject(id);
    try {
      await this.adapter.remove(id);
    } catch (err) {
      this.store.replaceAll(snapshot);
      throw err;
    }
  }

  // Optimistic reorder. Mirrors the array immediately so the drop
  // animation lands smoothly; a 250ms debounce coalesces drag bursts
  // before one Tauri write. On persistence failure the next loadAll()
  // recovers; we don't snapshot the order client-side because the
  // user has likely already moved on visually.
  reorder(prevIndex: number, currentIndex: number): void {
    this.store.reorderProjects(prevIndex, currentIndex);
    if (this.reorderTimer != null) clearTimeout(this.reorderTimer);
    this.reorderTimer = setTimeout(() => {
      this.reorderTimer = null;
      const orderedIds = this.store
        .projects()
        .filter((p) => !p.hidden)
        .map((p) => p.id);
      void this.adapter
        .setSort(orderedIds)
        .catch((err) => console.warn('persist project order failed', err));
    }, 250);
  }
}

export type { GroupBy, ProjectFilter };
