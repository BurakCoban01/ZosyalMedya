import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/preferences/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  /**
   * Instantiate ThemeService on boot so it owns `data-theme` /
   * `data-reduce-motion` after the pre-paint script in index.html has applied
   * the persisted choice. The service is `providedIn: 'root'`; injecting it
   * here is enough to construct it and run its applying effect.
   */
  private readonly theme = inject(ThemeService);
}
