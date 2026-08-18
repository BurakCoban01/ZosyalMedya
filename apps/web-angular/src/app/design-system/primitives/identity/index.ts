/**
 * ZosyalMedya design-system — identity primitives barrel.
 *
 * Re-exports the public surface of the identity family so consumers import
 * from a single entry point:
 *   import { ZmAvatarComponent, ZmChipComponent, ZmStatusComponent } from
 *     '../design-system/primitives/identity';
 *
 * Contract (VAL-DS-030 / VAL-DS-031 / VAL-DS-032):
 *   - ZmAvatar: stable identity-token color/initial fallback (deterministic by
 *     name), image load/error swap with reserved dimensions (no broken-image
 *     glyph, no layout shift), and a presence/unread ring SEPARATED from
 *     avatar content (independent color + non-color cue).
 *   - ZmChip: compact label token that ALWAYS carries a textual label; color
 *     categories couple with a distinct leading glyph so the category reads in
 *     grayscale; removable chips expose their remove action with an accessible
 *     name.
 *   - ZmStatus: inline status marker that ALWAYS carries a textual label + a
 *     leading shape whose form encodes the category; host is a live region
 *     (role=status polite default, role=alert when assertive).
 *
 * Status is never color-only (VAL-DS-029): every variant couples its accent
 * color with a distinct inline SVG glyph/shape + a textual label.
 *
 * Engine: CSS only (no `@angular/animations`). Consumes ONLY `--zm-avatar-*`
 * / `--zm-chip-*` / `--zm-status-*` component-layer tokens (no hardcoded hex).
 */
export * from './avatar.component';
export * from './chip.component';
export * from './status.component';
