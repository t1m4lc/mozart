import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-full overflow-hidden bg-background' },
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
