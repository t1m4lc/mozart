export { AuthFacade } from './lib/auth.facade';
export { AUTH_ADAPTER, type AuthAdapter } from './lib/auth.adapter';
export {
  type AuthSessionDto,
  sessionFromDto,
  sessionToDto,
} from './lib/auth.dto';
export { fakeAuthAdapter } from './lib/fake-auth.adapter';
export { authGuard } from './lib/auth.guard';
export {
  enableDevAuthBypassAndReload,
  isDevAuthBypassActive,
  isRunningInTauri,
} from './lib/dev-bypass';
