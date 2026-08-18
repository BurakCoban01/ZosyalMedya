/**
 * ZosyalMedya design-system — form-control primitives barrel.
 *
 * Re-exports the public surface of the form-control family so consumers import
 * from a single entry point:
 *   import { ZmInputComponent, ZmTextareaComponent, ZmSelectComponent } from
 *     '../design-system/primitives/form-controls';
 *
 * Contract (VAL-DS-021 / VAL-DS-022 / VAL-DS-023):
 *   - persistent <label> associated via for/id (placeholder never the only label);
 *   - error tied via aria-describedby + aria-invalid on error;
 *   - password reveal with safe focus and aria-pressed/aria-label state;
 *   - rest / hover / focus-visible / disabled / error / high-contrast coverage,
 *     with the control edge + focus ring surviving forced-colors.
 */
export * from './input.component';
export * from './textarea.component';
export * from './select.component';
