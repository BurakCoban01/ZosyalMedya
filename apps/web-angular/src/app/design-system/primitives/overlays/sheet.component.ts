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
import { GlobalPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ZM_DURATION, ZM_EASE } from '../../tokens';
import { ZmOverlayCloseReason, zmIsEscapeKey, zmRestoreFocus, zmSaveFocus } from './overlay-helpers';

/**
 * ZmSheet — side-anchored overlay that slides in from an edge.
 *
 * Contract (VAL-DS-026 / VAL-DS-027): identical a11y behavior to ZmDialog —
 * focus move-in, focus trap, Escape to close, return focus to the trigger,
 * outside-click (scrim) dismiss, and background scroll lock. Differs only in
 * presentation: the sheet hugs one viewport edge (`side`), takes the full
 * cross-axis, and slides along its axis (transform/opacity via `--zm-sheet-*`
 * tokens; reduced motion collapses to opacity-only).
 *
 * Default side: `end` (right in LTR, left in RTL) — the common contextual/
 * detail drawer. `bottom` is the mobile/full-width sheet; `start`/`top`/
 * `end` cover the remaining edges.
 *
 * @example
 * <zm-sheet #s [label]="'Filtreler'" side="end" (closed)="onClosed($event)">
 *   <h2 id="filtre-title">Filtreler</h2>
 *   ...filter controls...
 *   <zm-button (clicked)="s.close()">Uygula</zm-button>
 * </zm-sheet>
 * <zm-button (clicked)="s.open()">Filtreler</zm-button>
 */
export type ZmSheetSide = 'start' | 'end' | 'top' | 'bottom';

let nextZmSheetId = 0;

@Component({
  selector: 'zm-sheet',
  standalone: true,
  imports: [CdkTrapFocus],
  styleUrl: './sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-sheet' },
  template: `
    <ng-template #content>
      <div
        class="zm-sheet__panel zm-enter"
        [class.is-open]="isOpen()"
        [class.is-start]="side() === 'start'"
        [class.is-end]="side() === 'end'"
        [class.is-top]="side() === 'top'"
        [class.is-bottom]="side() === 'bottom'"
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
export class ZmSheetComponent implements OnDestroy {
  /** Accessible name. Required when `labelledBy` is not supplied. */
  readonly label = input<string>('');

  /** Id of a title element inside the sheet that names it. Takes precedence. */
  readonly labelledBy = input<string>('');

  /** Which viewport edge the sheet slides in from. `end` (default) is the
   *  contextual/detail drawer; `bottom` is the mobile/full-width sheet. */
  readonly side = input<ZmSheetSide>('end');

  /** Maximum cross-axis size of the sheet (e.g. '32rem', '90vw'). */
  readonly maxSize = input<string>('');

  /** Whether the sheet can be dismissed via scrim-click / Escape. */
  readonly dismissible = input<boolean>(true);

  /** Emitted after the sheet opens and focus has moved inside. */
  readonly opened = output<void>();

  /** Emitted with the close reason after focus has returned to the trigger. */
  readonly closed = output<ZmOverlayCloseReason>();

  readonly id = input<string>('');

  readonly panelId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-sheet-${nextZmSheetId++}`;
  });

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

  /** Open the sheet. Moves focus inside and locks background scroll. */
  open(): void {
    if (this.overlayRef) return;
    this.previouslyFocused = zmSaveFocus();
    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'zm-sheet-backdrop',
      panelClass: 'zm-sheet-pane',
      positionStrategy: this.buildPosition(),
      scrollStrategy: this.overlay.scrollStrategies.block(),
      disposeOnNavigation: true,
    });
    this.overlayRef.attach(new TemplatePortal(this.contentTpl, this.vcr));
    this.overlayRef.backdropClick().subscribe(() => {
      if (this.dismissible()) {
        this.close('backdrop');
      }
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

    queueMicrotask(() => {
      const panel = this.overlayRef?.overlayElement.querySelector<HTMLElement>('.zm-sheet__panel');
      panel?.focus();
    });

    this.isOpen.set(true);
    this.opened.emit();
  }

  /** Close the sheet. */
  close(reason: ZmOverlayCloseReason = 'programmatic'): void {
    if (!this.overlayRef) return;
    this.pendingReason = reason;
    this.overlayRef.detach();
  }

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

  private finalizeClose(): void {
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    zmRestoreFocus(this.previouslyFocused);
    this.previouslyFocused = null;
    const reason = this.pendingReason;
    this.pendingReason = 'programmatic';
    this.closed.emit(reason);
  }

  /** Build the global position strategy for the chosen side. */
  private buildPosition(): GlobalPositionStrategy {
    const side = this.side();
    const ps = this.overlay.position().global();
    switch (side) {
      case 'start':
        return ps.left('0').top('0').bottom('0');
      case 'end':
        return ps.right('0').top('0').bottom('0');
      case 'top':
        return ps.left('0').right('0').top('0');
      case 'bottom':
        return ps.left('0').right('0').bottom('0');
    }
  }

  protected readonly durationToken = ZM_DURATION.slow;
  protected readonly easeToken = ZM_EASE.emphasized;

  protected get hostEl(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
