import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

// Bridges file-chip clicks from dynamically-instantiated renderers
// (mounted via NgComponentOutlet, which can't bind outputs) up to
// TurnContainer, which forwards them to its (fileChipClick) output.
//
// Provided in TurnContainer's component providers so each turn has
// its own bus instance — clicks scope to the originating turn.

@Injectable()
export class FileChipBus {
  readonly clicked = new Subject<string>();

  emit(path: string): void {
    this.clicked.next(path);
  }
}
