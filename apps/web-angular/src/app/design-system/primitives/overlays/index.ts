/**
 * ZosyalMedya design-system — overlay primitives barrel.
 *
 * Re-exports the public surface of the overlay family so consumers import
 * from a single entry point:
 *   import { ZmTooltipComponent, ZmMenuComponent, ZmDialogComponent,
 *            ZmSheetComponent } from '../design-system/primitives/overlays';
 *
 * Contract (VAL-DS-026 / VAL-DS-027):
 *   - dialog / sheet / menu move focus inside on open, trap Tab within the
 *     overlay, close on Escape, and return focus to the trigger on close;
 *   - dialog / sheet / menu dismiss on an outside pointer-down (scrim for
 *     dialog/sheet; transparent backdrop for menu) and lock background scroll
 *     while open;
 *   - destructive (non-dismissible) dialogs/sheets ignore scrim-click and
 *     Escape so the user must make an explicit decision;
 *   - tooltip is a transient label (hover/focus reveal, aria-describedby);
 *     it does NOT trap focus or lock scroll (transient by design).
 *
 * Engine: Angular CDK overlay/portal/a11y. No `@angular/animations`. Motion
 * via CSS (transform/opacity + `--zm-*` duration/ease tokens); reduced motion
 * collapses to opacity-only.
 */
export * from './tooltip.component';
export * from './menu.component';
export * from './dialog.component';
export * from './sheet.component';
