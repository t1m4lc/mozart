import type {
  FileChangeStatus,
  FileNode,
  FileNodeKind,
} from '@mozart/desktop-repositories-util';

// Wire shape returned by the Tauri `list_tree` command. Declared
// locally so this lib has no inbound dep on apps/_bindings — the
// desktop app passes its generated `FileNodeDto` into the mapper
// and TypeScript structural typing closes the bridge.
export interface FileNodeDto {
  readonly path: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly ignored: boolean;
  readonly children?: readonly FileNodeDto[] | null;
  readonly added?: number | null;
  readonly removed?: number | null;
}

const STATUS_BY_WIRE: Record<string, FileChangeStatus> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
  unchanged: 'unchanged',
};

const KIND_BY_WIRE: Record<string, FileNodeKind> = {
  file: 'file',
  directory: 'directory',
};

function coerceStatus(raw: string): FileChangeStatus {
  return STATUS_BY_WIRE[raw] ?? 'unchanged';
}

function coerceKind(raw: string): FileNodeKind {
  return KIND_BY_WIRE[raw] ?? 'file';
}

/** DTO -> domain model. Recursive — children mirror the wire shape. */
export function fileNodeFromDto(dto: FileNodeDto): FileNode {
  const kind = coerceKind(dto.kind);
  return {
    path: dto.path,
    name: dto.name,
    kind,
    status: coerceStatus(dto.status),
    ignored: dto.ignored,
    children:
      kind === 'directory'
        ? (dto.children ?? []).map(fileNodeFromDto)
        : undefined,
    added: dto.added ?? undefined,
    removed: dto.removed ?? undefined,
  };
}
