import { Injectable, computed, inject } from '@angular/core';
import { DIALOG_ADAPTER } from './dialog.adapter';
import type { Project } from './project.model';
import type { GroupBy, ProjectFilter } from './project.store';
import { ProjectStore } from './project.store';
import { PROJECTS_ADAPTER } from './projects.adapter';

// Public API of the `projects` domain. Features inject this — never
// the store directly.
@Injectable({ providedIn: 'root' })
export class ProjectsFacade {
  private readonly store = inject(ProjectStore);
  private readonly dialog = inject(DIALOG_ADAPTER);
  private readonly adapter = inject(PROJECTS_ADAPTER);

  // Reads
  readonly all = this.store.projects;
  readonly visible = this.store.visibleProjects;
  readonly hoveredId = this.store.hoveredProjectId;
  readonly groupBy = this.store.groupBy;
  readonly projectFilter = this.store.projectFilter;
  readonly allProjectsSelected = this.store.allProjectsSelected;
  readonly byId = (id: string) =>
    computed(() => this.store.projects().find((p) => p.id === id) ?? null);

  // Mirror of internal `expandedIds.has(id)` so features don't reach
  // into the store.
  isExpanded(id: string): boolean {
    return this.store.isExpanded(id);
  }

  /**
   * Hydrate from Tauri at boot. Idempotent on the store: re-loading
   * preserves expanded-state for ids that still exist.
   */
  async loadAll(): Promise<void> {
    const projects = await this.adapter.list();
    this.store.setAll(projects);
  }

  /**
   * Opens the system folder picker. Cancellation returns null silently.
   * On a valid pick, delegates to {@link add}.
   */
  async openPickerAndAdd(): Promise<Project | null> {
    const path = await this.dialog.pickFolder();
    if (path == null) return null;
    return this.add(path);
  }

  /**
   * Persists via Tauri (`add_repo`, idempotent on path) and upserts
   * the returned row into the store. Returns the canonical Project
   * (with the Tauri-assigned `repo_id` as `id`).
   */
  async add(path: string): Promise<Project> {
    const project = await this.adapter.add(path);
    this.store.upsertProject(project);
    return project;
  }

  // Writes — thin pass-through.
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
  hide(id: string): void {
    this.store.hideProject(id);
  }
  remove(id: string): void {
    this.store.removeProject(id);
  }
  reorder(prevIndex: number, currentIndex: number): void {
    this.store.reorderProjects(prevIndex, currentIndex);
  }
}

export type { GroupBy, ProjectFilter };

// Extracts the trailing path segment, tolerant of both POSIX (`/`) and
// Windows (`\`) separators.
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
