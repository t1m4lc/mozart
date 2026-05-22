import type { FileNodeDto } from '../../../core/_bindings';
import type {
  FileChangeStatus,
  FileNode,
  FileNodeKind,
} from './file-node.model';

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
