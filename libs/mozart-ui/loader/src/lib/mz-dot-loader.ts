import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MzLoader } from './mz-loader';

/**
 * Inline "dot" loader preset — the single-glyph braille spinner used in
 * tab strips and sidebar rows to mark something as active. Centralises
 * the `<mz-loader size="xs" variant="simple" class="text-brand" />`
 * incantation so call sites stay one tag.
 */
@Component({
  selector: 'mz-dot-loader',
  imports: [MzLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mz-loader size="xs" variant="simple" class="text-brand" />`,
})
export class MzDotLoader {}
