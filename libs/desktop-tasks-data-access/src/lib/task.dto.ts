// Wire shape returned by the Tauri `list_tasks` command. Kept as a
// stand-alone interface (rather than re-exporting the Tauri-generated
// `Task` type from apps/desktop/_bindings) so this lib has no inbound
// dependency on the app. The desktop app passes its generated DTOs to
// `taskFromDto()` directly — structural typing handles the bridge.
export interface TaskDto {
  readonly task_id: string;
  readonly repo_id: string;
  readonly title: string;
  readonly task_text: string;
  readonly status: string;
  readonly created_at: number;
}
