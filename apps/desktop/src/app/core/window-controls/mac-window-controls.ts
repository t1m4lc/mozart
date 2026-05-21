import { ChangeDetectionStrategy, Component } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Component({
  selector: 'app-mac-window-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  template: `
    <div
      class="group/mac flex items-center gap-2"
      aria-label="macOS window controls"
    >
      <button
        type="button"
        aria-label="Close window"
        (click)="close()"
        class="relative size-3 rounded-full border border-black/10 bg-[#ff5f57]
           before:absolute before:inset-0 before:flex before:items-center before:justify-center
           before:text-[14px] before:font-bold before:leading-none before:text-black/55
           before:content-['×'] before:opacity-0 group-hover/mac:before:opacity-100"
      ></button>

      <button
        type="button"
        aria-label="Minimize window"
        (click)="minimize()"
        class="relative size-3 rounded-full border border-black/10 bg-[#ffbd2e]
           before:absolute before:inset-0 before:flex before:items-center before:justify-center
           before:text-[14px] before:font-bold before:leading-none before:text-black/55
           before:content-['−'] before:opacity-0 group-hover/mac:before:opacity-100"
      ></button>

      <button
        type="button"
        (click)="toggleMaximize()"
        aria-label="Toggle fullscreen"
        class="relative size-3 rounded-full border border-black/10 bg-[#28c840]"
      >
        <span
          class="pointer-events-none absolute left-0.5 top-0.5
           size-0 border-l-[4.5px] border-b-[4.5px]
           border-l-black/60 border-b-transparent
           opacity-0 group-hover/mac:opacity-100"
        ></span>

        <span
          class="pointer-events-none absolute right-0.5 bottom-0.5
           size-0 border-r-[4.5px] border-t-[4.5px]
           border-r-black/60 border-t-transparent
           opacity-0 group-hover/mac:opacity-100"
        ></span>
      </button>
    </div>
  `,
})
export class MacWindowControls {
  protected minimize(): Promise<void> {
    return getCurrentWindow().minimize();
  }
  protected toggleMaximize(): Promise<void> {
    return getCurrentWindow().toggleMaximize();
  }
  protected close(): Promise<void> {
    return getCurrentWindow().close();
  }
}
