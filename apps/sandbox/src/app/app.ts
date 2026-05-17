import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ThemeSwitcher } from './theme-switcher';

@Component({
  imports: [RouterModule, ThemeSwitcher],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-screen w-full flex-col overflow-hidden bg-background',
  },
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
