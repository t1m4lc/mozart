export type PagesContext<Env = Record<string, never>> = {
  readonly request: Request;
  readonly env: Env;
};

export const INTERNAL_DEVICE_COOKIE = 'mozart_internal_device';

export function isInternalCookiePresent(
  cookieHeader: string,
  name: string,
): boolean {
  if (!cookieHeader) return false;
  const prefix = `${name}=`;
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith(prefix) && part.length > prefix.length);
}
