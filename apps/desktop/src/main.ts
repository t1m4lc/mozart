import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app.component';
import { appConfig } from './app/app.config';

// Silence verbose console output in production binaries. warn/error stay
// so real failures still surface in devtools. To re-enable tracing on a
// release build, run in the devtools console:
//   localStorage.setItem('mozart:debug', '1'); location.reload();
if (!isDevMode() && !localStorage.getItem('mozart:debug')) {
  const noop = (): void => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
