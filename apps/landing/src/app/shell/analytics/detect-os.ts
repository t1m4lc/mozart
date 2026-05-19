import type { OsService } from '@mozart/shared-util-os';

export type OsTag = 'mac' | 'windows' | 'linux' | 'unknown';

export function detectOsTag(os: OsService): OsTag {
  if (os.isMac()) return 'mac';
  if (os.isWindows()) return 'windows';
  if (os.isLinux()) return 'linux';
  return 'unknown';
}
