import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { ConnectionStatus } from './connection.model';

interface State {
  status: ConnectionStatus;
  lastCheckedAt: Date | null;
}

const initialState: State = {
  status: 'unknown',
  lastCheckedAt: null,
};

// NgRx signalStore holding the (singular) connection state. The facade is
// the only consumer; UI components never inject the store directly.
export const ProfileStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('profile'),
  withMethods((store) => ({
    setStatus(status: ConnectionStatus, lastCheckedAt?: Date): void {
      patchState(store, {
        status,
        lastCheckedAt: lastCheckedAt ?? store.lastCheckedAt(),
      });
    },
    setChecking(): void {
      patchState(store, { status: 'checking' });
    },
  })),
);
