/**
 * ZosyalMedya design-system — feedback & state primitives barrel.
 *
 * Re-exports the public surface of the feedback/state family so consumers
 * import from a single entry point:
 *   import { ZmToastComponent, ZmSkeletonComponent,
 *            ZmEmptyStateComponent, ZmErrorStateComponent,
 *            ZmPermissionStateComponent } from '../design-system/primitives/feedback-states';
 *
 * Contract (VAL-DS-028 / VAL-DS-029):
 *   - ZmToast: live-region announcement (role=status for info/success/warning,
 *     role=alert for error), auto-dismiss with hover/focus pause, focus return
 *     to the element focused before entering the toast, optional inline action.
 *   - ZmSkeleton: shimmer placeholder; aria-hidden (decorative); shimmer
 *     collapses to a static tonal block under reduced motion (no loop).
 *   - ZmEmptyState: specific Turkish title + cause + useful next action;
 *     role=group (informational, not an alert).
 *   - ZmErrorState: role=alert, specific cause + consequence + retry; distinct
 *     alert glyph so the error reads in grayscale.
 *   - ZmPermissionState: rationale + path to request access; distinct lock
 *     glyph so the permission state reads in grayscale.
 *
 * Status is never communicated by color alone (VAL-DS-029): every variant
 * couples its accent color with a distinct inline SVG glyph.
 *
 * Engine: CSS only (no `@angular/animations`). Motion via transform/opacity +
 * `--zm-*` duration/ease tokens; reduced motion collapses to opacity-only.
 */
export * from './skeleton.component';
export * from './toast.component';
export * from './empty-state.component';
export * from './error-state.component';
export * from './permission-state.component';
