/**
 * ZosyalMedya design-system — selection-control primitives barrel.
 *
 * Re-exports the public surface of the selection-control family so consumers
 * import from a single entry point:
 *   import { ZmCheckboxComponent, ZmRadioComponent, ZmSwitchComponent,
 *            ZmSegmentedComponent } from '../design-system/primitives/selection-controls';
 *
 * Contract (VAL-DS-024 / VAL-DS-025):
 *   - checkbox / radio / switch expose state + labels (non-color cues);
 *   - segmented exposes single/multi selection + current choice to AT and is
 *     fully keyboard operable (roving tabindex + arrow/Home/End/Space/Enter);
 *   - error tied via aria-describedby + aria-invalid on error;
 *   - rest / hover / focus-visible / checked / disabled / error / high-contrast
 *     coverage, with the control edge + indicator + focus ring surviving
 *     forced-colors.
 */
export * from './checkbox.component';
export * from './radio.component';
export * from './switch.component';
export * from './segmented.component';
