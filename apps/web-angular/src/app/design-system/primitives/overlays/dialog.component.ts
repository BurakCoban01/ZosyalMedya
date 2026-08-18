import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  computed,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ZM_DURATION, ZM_EASE } from '../../tokens';
import { ZmOverlayCloseReason, zmIsEscapeKey, zmRestoreFocus, zmSaveFocus } from './overlay-helpers';

/**
 * ZmDialog — centered modal dialog (focus-trapping overlay).
 *
 * Contract (VAL-DS-026 / VAL-DS-027):
 *
 *   - **Focus move-in** (VAL-DS-026): on open, focus moves to the dialog panel
 *     (or the first focusable descendant). The panel carries `tabindex=-1` so
 *     it is a valid focus target even when it has no tabbable child.
 *   - **Focus trap** (VAL-DS-026): Tab/Shift+Tab cycle within the dialog and
 *     never escape to the background page (CDK `cdkTrapFocus`).
 *   - **Escape to close** (VAL-DS-026): pressing Escape closes the dialog and
 *     returns focus. Suppressed when `dismissible` is false (destructive /
 *     blocking dialogs).
 *   - **Return focus on close** (VAL-DS-026): focus returns to the trigger that
 *     opened the dialog (captured at open time via `zmSaveFocus`).
 *   - **Outside-click / scrim** (VAL-DS-027): the scrim is the backdrop.
 *     Clicking the scrim closes the dialog ONLY when `dismissible` is true.
 *     A non-dismissible (destructive) dialog ignores scrim-click so the user
 *     must use an explicit confirm/cancel control — the assertion's negative
 *     path.
 *   - **Scroll lock** (VAL-DS-027): `scrollStrategies.block()` locks the
 *     background page scroll while the dialog is open and restores it on
 *     close (no background scroll).
 *
 * Role/semantics: the panel is `role="dialog"` with `aria-modal="true"` and a
 * required accessible name (`label` → `aria-label`, or `labelledBy` when the
 * caller supplies a title element id). Headings inside should use `id` and be
 * referenced via `labelledBy` for the strict dialog-name contract.
 *
 * Engine: CDK overlay (GlobalPositionStrategy centered) + TemplatePortal +
 * cdkTrapFocus. Motion is CSS (transform/opacity via `--zm-dialog-*` tokens);
 * reduced motion collapses via the token cascade. No `@angular/animations`.
 *
 * @example
 * <zm-dialog #d [label]="'Gönderiyi sil'" (closed)="onClosed($event)">
 *   <h2 id="sil-title">Gönderiyi sil?</h2>
 *   <p>Bu işlem geri alınamaz.</p>
 *   <zm-button (clicked)="d.close()">Vazgeç</zm-button>
 * </zm-dialog>
 * <zm-button (clicked)="d.open()">Sil</zm-button>
 */
export type ZmDialogSize = 'sm' | 'md' | 'lg';

let nextZmDialogId = 0;

@Component({
  selector: 'zm-dialog',
  standalone: true,
  imports: [CdkTrapFocus],
  styleUrl: './dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-dialog' },
  template: `
    <ng-template #content>
      <div
        class="zm-dialog__panel zm-enter"
        [class.is-open]="isOpen()"
        [class.is-sm]="size() === 'sm'"
        [class.is-lg]="size() === 'lg'"
        [class.is-destructive]="!dismissible()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="labelledBy() ? null : label()"
        [attr.aria-labelledby]="labelledBy()"
        [attr.id]="panelId()"
        tabindex="-1"
        cdkTrapFocus
        (keydown)="onKeydown($event)"
      >
        <ng-content></ng-content>
      </div>
    </ng-template>
  `,
})
export class ZmDialogComponent implements OnDestroy {
  /** Accessible name. Required when `labelledBy` is not supplied (the dialog
   *  must always have an accessible name per VAL-DS-026 + WAI-ARIA dialog). */
  readonly label = input<string>('');

  /** Id of a title element inside the projected content that names the dialog.
   *  Takes precedence over `label` for the strict dialog-name contract. */
  readonly labelledBy = input<string>('');

  /** Density: sm (confirmation) / md (default) / lg (complex forms). */
  readonly size = input<ZmDialogSize>('md');

  /** Whether the dialog can be dismissed via scrim-click / Escape. Set `false`
   *  for destructive / blocking flows that require an explicit decision
   *  (VAL-DS-027 negative path). */
  readonly dismissible = input<boolean>(true);

  /** Emitted after the dialog opens and focus has moved inside. */
  readonly opened = output<void>();

  /** Emitted with the close reason when the dialog fully closes (after focus
   *  has been returned to the trigger). */
  readonly closed = output<ZmOverlayCloseReason>();

  /** Stable id for the panel (used by `aria-labelledby` callers + tests). */
  readonly panelId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-dialog-${nextZmDialogId++}`;
  });

  /** Optional explicit id override (otherwise generated). */
  readonly id = input<string>('');

  readonly isOpen = signal<boolean>(false);

  @ViewChild('content', { static: true }) private contentTpl!: TemplateRef<unknown>;

  private overlayRef: OverlayRef | null = null;
  private previouslyFocused: HTMLElement | null = null;
  private pendingReason: ZmOverlayCloseReason = 'programmatic';

  constructor(
    private overlay: Overlay,
    private vcr: ViewContainerRef,
    private elementRef: ElementRef<HTMLElement>,
  ) {}

  /** Open the dialog. Moves focus inside and locks background scroll. */
  open(): void {
    if (this.overlayRef) return;
    this.previouslyFocused = zmSaveFocus();
    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'zm-dialog-backdrop',
      panelClass: 'zm-dialog-pane',
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: this.overlay.scrollStrategies.block(),
      disposeOnNavigation: true,
    });
    this.overlayRef.attach(new TemplatePortal(this.contentTpl, this.vcr));
    this.overlayRef.backdropClick().subscribe(() => {
      if (this.dismissible()) {
        this.close('backdrop');
      }
      // Non-dismissible: ignore scrim-click (VAL-DS-027 negative path).
    });
    this.overlayRef.keydownEvents().subscribe(e => {
      if (zmIsEscapeKey(e)) {
        if (this.dismissible()) {
          e.preventDefault();
          this.close('escape');
        }
      }
    });
    this.overlayRef.detachments().subscribe(() => this.finalizeClose());

    // Move focus into the dialog (VAL-DS-026). Defer one microtask so the
    // portal content is in the DOM and the trap has a target to focus.
    queueMicrotask(() => {
      const panel = this.overlayRef?.overlayElement.querySelector<HTMLElement>('.zm-dialog__panel');
      panel?.focus();
    });

    this.isOpen.set(true);
    this.opened.emit();
  }

  /** Close the dialog. `programmatic` reason unless called by the overlay
   *  handlers (escape/backdrop) which pass their own reason. */
  close(reason: ZmOverlayCloseReason = 'programmatic'): void {
    if (!this.overlayRef) return;
    this.pendingReason = reason;
    this.overlayRef.detach();
    // detach() fires detachments() synchronously → finalizeClose().
  }

  /** Keyboard handler for the panel. Escape is also handled via the overlay's
   *  keydownEvents (catches Escape even when focus is on the backdrop), but we
   *  handle it here too so a single source of truth inside the panel works
   *  even if the overlay keydown path is bypassed. */
  onKeydown(event: KeyboardEvent): void {
    if (zmIsEscapeKey(event) && this.dismissible()) {
      event.preventDefault();
      this.close('escape');
    }
  }

  ngOnDestroy(): void {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  /** Runs on every detachment (including the destructor path). Returns focus
   *  to the trigger and emits `closed`. Idempotent. */
  private finalizeClose(): void {
    if (!this.overlayRef) {
      // Already finalized (e.g. ngOnDestroy after an explicit close).
      return;
    }
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    zmRestoreFocus(this.previouslyFocused);
    this.previouslyFocused = null;
    const reason = this.pendingReason;
    this.pendingReason = 'programmatic';
    this.closed.emit(reason);
  }

  // Token names referenced by the CSS file (documentation hook + shields the
  // component from inline literals; the values live in tokens.css).
  protected readonly durationToken = ZM_DURATION.base;
  protected readonly easeToken = ZM_EASE.enter;

  // Host-element ref kept so future enhancements (e.g. origin animation) can
  // read the trigger position without re-injecting.
  protected get hostEl(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
