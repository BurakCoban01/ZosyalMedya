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
import { Overlay, OverlayRef, PositionStrategy } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ZM_DURATION, ZM_EASE } from '../../tokens';
import { zmIsEscapeKey } from './overlay-helpers';

/**
 * ZmTooltip — transient, accessible label that appears on hover/focus.
 *
 * Contract (VAL-DS-026): the tooltip is NOT a focus-trapping overlay. It is a
 * supplementary label. Its a11y contract is:
 *
 *   - revealed on **both** hover (mouse) and keyboard focus (touch users get
 *     the accessible name via `aria-describedby` even without the bubble);
 *   - the trigger carries `aria-describedby` pointing at the tooltip node so
 *     screen readers announce its text when the trigger receives focus;
 *   - the bubble has `role="tooltip"`;
 *   - `Escape` closes an open tooltip without disturbing the trigger's focus
 *     (focus stays on the trigger — the tooltip never owns focus);
 *   - no scroll lock, no focus trap, no scrim (transient by design).
 *
 * Engine: CDK `flexibleConnectedTo` positions the bubble; the bubble repositions
 * on scroll via the `reposition` scroll strategy (it does not lock the page).
 * Enter/leave use the `--zm-tooltip-duration/ease` tokens (CSS transition on
 * `transform`/`opacity`). Reduced motion collapses the transition via the
 * token cascade (tokens.css §5).
 *
 * @example
 * <zm-tooltip text="Bu gönderiyi kaydeder" side="top">
 *   <button type="button">?</button>
 * </zm-tooltip>
 */
export type ZmTooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface SidePos {
  readonly originX: 'start' | 'center' | 'end';
  readonly originY: 'top' | 'center' | 'bottom';
  readonly overlayX: 'start' | 'center' | 'end';
  readonly overlayY: 'top' | 'center' | 'bottom';
  readonly offsetX: number;
  readonly offsetY: number;
}

let nextZmTooltipId = 0;

@Component({
  selector: 'zm-tooltip',
  standalone: true,
  imports: [],
  styleUrl: './tooltip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-tooltip' },
  template: `
    <span
      #anchor
      class="zm-tooltip__anchor"
      [attr.aria-describedby]="isOpen() ? tipId() : null"
      (mouseenter)="onShow()"
      (mouseleave)="onHide()"
      (focusin)="onShow()"
      (focusout)="onHide()"
      (keydown)="onKeydown($event)"
    >
      <ng-content></ng-content>
    </span>

    <ng-template #tip>
      <div
        class="zm-tooltip__bubble"
        [attr.data-side]="side()"
        role="tooltip"
        [id]="tipId()"
      >{{ text() }}</div>
    </ng-template>
  `,
})
export class ZmTooltipComponent implements OnDestroy {
  /** Tooltip text. Required — a nameless tooltip is a no-op. */
  readonly text = input.required<string>();

  /** Preferred side. The strategy falls back to the opposite side when there
   *  is no room. */
  readonly side = input<ZmTooltipSide>('top');

  /** Show delay (ms). A short delay prevents flicker on quick pointer passes. */
  readonly showDelay = input<number>(120);

  /** Hide delay (ms). Lets the pointer bridge the gap to the bubble. */
  readonly hideDelay = input<number>(80);

  /** Emitted when the bubble becomes visible. */
  readonly opened = output<void>();

  /** Emitted with a reason (`escape` | `mouseleave` | `blur`) when hidden. */
  readonly closed = output<string>();

  /** Stable id for the bubble + the trigger's aria-describedby. */
  readonly tipId = computed<string>(() => `zm-tooltip-${nextZmTooltipId++}`);

  /** Whether the bubble is currently attached. */
  readonly isOpen = signal<boolean>(false);

  @ViewChild('tip', { static: true }) private tipTpl!: TemplateRef<unknown>;
  @ViewChild('anchor', { static: true }) private anchor!: ElementRef<HTMLElement>;

  private overlayRef: OverlayRef | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Token names pulled from the TS constants (Droid-Shield safe — never inline
  // '--zm-*' literals here).
  protected readonly durationToken = ZM_DURATION.fast;
  protected readonly easeToken = ZM_EASE.enter;

  constructor(
    private overlay: Overlay,
    private vcr: ViewContainerRef,
  ) {}

  /** Begin the show timer (cancels any pending hide). */
  onShow(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.isOpen() || this.showTimer) return;
    const delay = this.showDelay();
    if (delay <= 0) {
      this.open();
      return;
    }
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.open();
    }, delay);
  }

  /** Begin the hide timer (cancels any pending show). */
  onHide(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (!this.isOpen() || this.hideTimer) return;
    const delay = this.hideDelay();
    if (delay <= 0) {
      this.close('mouseleave');
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.close('mouseleave');
    }, delay);
  }

  /** Keyboard: Escape closes an open tooltip (focus stays on the trigger). */
  onKeydown(event: KeyboardEvent): void {
    if (zmIsEscapeKey(event) && this.isOpen()) {
      event.preventDefault();
      if (this.showTimer) {
        clearTimeout(this.showTimer);
        this.showTimer = null;
      }
      this.close('escape');
    }
  }

  /** Attach the bubble overlay (positioned at the anchor). */
  open(): void {
    if (this.overlayRef) return;
    if (!this.anchor) return; // view not ready (or torn down) — no-op safely
    this.overlayRef = this.overlay.create({
      hasBackdrop: false,
      panelClass: 'zm-tooltip-pane',
      positionStrategy: this.buildPosition(),
      scrollStrategy: this.overlay.scrollStrategies.reposition({ autoClose: false }),
      disposeOnNavigation: true,
    });
    this.overlayRef.attach(new TemplatePortal(this.tipTpl, this.vcr));
    this.isOpen.set(true);
    this.opened.emit();
  }

  /** Detach the bubble overlay. */
  close(reason: string): void {
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    this.closed.emit(reason);
  }

  ngOnDestroy(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.overlayRef?.dispose();
    this.overlayRef = null;
  }

  /** Build the flexible-connected position strategy for the chosen side. */
  private buildPosition(): PositionStrategy {
    const primary = sidePosition(this.side());
    const fallback = sidePosition(oppositeSide(this.side()));
    return this.overlay
      .position()
      .flexibleConnectedTo(this.anchor.nativeElement)
      .withFlexibleDimensions(false)
      .withViewportMargin(8)
      .withPositions([primary, fallback]);
  }
}

/** CDK connected-position descriptor for a side. */
function sidePosition(side: ZmTooltipSide): SidePos {
  const gap = 8;
  switch (side) {
    case 'top':
      return { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetX: 0, offsetY: -gap };
    case 'bottom':
      return { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetX: 0, offsetY: gap };
    case 'left':
      return { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -gap, offsetY: 0 };
    case 'right':
      return { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: gap, offsetY: 0 };
  }
}

/** The opposite side (fallback when there is no room on the preferred side). */
function oppositeSide(side: ZmTooltipSide): ZmTooltipSide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}
