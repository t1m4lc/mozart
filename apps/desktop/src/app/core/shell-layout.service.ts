import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellLayoutService {
  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  toggleLeftPanel(): void {
    this.leftPanelOpen.update((v) => !v);
  }

  toggleRightPanel(): void {
    this.rightPanelOpen.update((v) => !v);
  }
}
