// Run-tab status surface. The badge maps these onto Tailwind tones.
//   - `starting` — PTY spawned, server not yet announced (shows a loader).
//   - `running`  — output indicates the dev server is up (loader cleared).
export type RunStatus = 'idle' | 'starting' | 'running' | 'exited';
