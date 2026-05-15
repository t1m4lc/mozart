// Pure helper. Best-effort UA sniff to decide whether to show the
// "Mozart is desktop-only" copy on /dashboard. Not a security boundary
// — just a UX hint.

export function isMobileUserAgent(ua: string): boolean {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Opera Mini/i.test(ua);
}
