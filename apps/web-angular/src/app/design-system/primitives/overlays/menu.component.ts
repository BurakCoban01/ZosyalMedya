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
import { FlexibleConnectedPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ZM_DURATION, ZM_EASE } from '../../tokens';
import { ZmOverlayCloseReason, zmIsEscapeKey, zmRestoreFocus, zmSaveFocus } from './overlay-helpers';

/**
 * ZmMenu — anchored popover list of actions.
 *
 * Contract (VAL-DS-026 / VAL-DS-027):
 *
 *   - **Focus move-in** (VAL-DS-026): on open, focus moves to the first
 *     `role="menuitem"` (or the panel itself when empty).
 *   - **Focus trap** (VAL-DS-026): Tab cycles within the menu (cdkTrapFocus)
 *     and never escapes to the background page.
 *   - **Arrow navigation** (WAI-ARIA menu): ArrowDown/ArrowUp move focus
 *     between `role="menuitem"` children (skipping disabled ones); Home/End
 *     jump to the first/last. ArrowLeft/ArrowRight are passed through
 *     (sub-menu opening is out of scope for this behavior primitive).
 *   - **Escape to close** (VAL-DS-026): closes the menu and returns focus to
 *     the trigger that opened it.
 *   - **Return focus** (VAL-DS-026): focus returns to the trigger.
 *   - **Outside-click dismiss** (VAL-DS-027): a transparent backdrop captures
 *     pointer-down outside the panel and closes the menu WITHOUT firing any
 *     inner action.
 *   - **Scroll lock** (VAL-DS-027): `scrollStrategies.block()` locks the
 *     background page scroll while the menu is open.
 *
 * Role/semantics: the panel is `role="menu"` with `aria-label`. Children must
 * carry `role="menuitem"` (project them with that attribute, or use the
 * `.zm-menu__item` class which the keydown walker recognizes). The walker
 * queries `[role="menuitem"]` not `[role="menuitemradio"]`/`...checkbox` —
 * extend the selector if you need those variants.
 *
 * Engine: CDK `flexibleConnectedTo` anchors the panel to the trigger element
 * (passed to `open()`); a transparent backdrop gives outside-click dismiss
 * without a visible scrim. Motion is CSS (transform/opacity via `--zm-menu-*`
 * tokens). No `@angular/animations`.
 *
 * @example
 * <zm-menu #m [label]="'Gönderi eylemleri'">
 *   <div role="menuitem" (click)="onEdit()">Düzenle</div>
 *   <div role="menuitem" (click)="onShare()">Paylaş</div>
 *   <div role="menuitem" (click)="m.close()">Kapat</div>
 * </zm-menu>
 * <button type="button" (click)="m.open(menuTrigger)">Menü</button>
 */
let nextZmMenuId = 0;

@Component({
  selector: 'zm-menu',
  standalone: true,
  imports: [CdkTrapFocus],
  styleUrl: './menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-menu' },
  template: `
    <ng-template #content>
      <div
        class="zm-menu__panel zm-enter"
        [class.is-open]="isOpen()"
        role="menu"
        [attr.aria-label]="label()"
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
export class ZmMenuComponent implements OnDestroy {
  /** Accessible name of the menu (required). */
  readonly label = input.required<string>();

  readonly id = input<string>('');

  /** Emitted after the menu opens and focus has moved inside. */
  readonly opened = output<void>();

  /** Emitted with the close reason after focus has returned to the trigger. */
  readonly closed = output<ZmOverlayCloseReason>();

  readonly panelId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-menu-${nextZmMenuId++}`;
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

  /**
   * Open the menu anchored to `origin` (typically the trigger button element).
   * Moves focus to the first menuitem and locks background scroll.
   */
  open(origin: HTMLElement | null = null): void {
    if (this.overlayRef) return;
    const anchor = origin ?? this.elementRef.nativeElement;
    this.previouslyFocused = zmSaveFocus();
    this.overlayRef = this.overlay.create({
      // Transparent backdrop: captures outside pointer-down for dismiss but
      // is visually invisible (menus are non-modal; no scrim per design).
      hasBackdrop: true,
      backdropClass: 'zm-menu-backdrop',
      panelClass: 'zm-menu-pane',
      positionStrategy: this.buildPosition(anchor),
      scrollStrategy: this.overlay.scrollStrategies.block(),
      disposeOnNavigation: true,
    });
    this.overlayRef.attach(new TemplatePortal(this.contentTpl, this.vcr));
    this.overlayRef.backdropClick().subscribe(() => this.close('backdrop'));
    this.overlayRef.keydownEvents().subscribe(e => {
      if (zmIsEscapeKey(e)) {
        e.preventDefault();
        this.close('escape');
      }
    });
    this.overlayRef.detachments().subscribe(() => this.finalizeClose());

    // Move focus to the first menuitem, else the panel itself.
    queueMicrotask(() => {
      const panel = this.overlayRef?.overlayElement.querySelector<HTMLElement>('.zm-menu__panel');
      if (!panel) return;
      const items = this.collectItems(panel);
      const firstIdx = this.firstEnabled(items);
      const first = firstIdx >= 0 ? items[firstIdx] : null;
      if (first) {
        first.focus();
      } else {
        panel.focus();
      }
    });

    this.isOpen.set(true);
    this.opened.emit();
  }

  /** Close the menu. */
  close(reason: ZmOverlayCloseReason = 'programmatic'): void {
    if (!this.overlayRef) return;
    this.pendingReason = reason;
    this.overlayRef.detach();
  }

  /** Panel keyboard handler: arrow/Home/End nav + Escape. */
  onKeydown(event: KeyboardEvent): void {
    if (zmIsEscapeKey(event)) {
      event.preventDefault();
      this.close('escape');
      return;
    }
    const panel = event.currentTarget as HTMLElement;
    const items = this.collectItems(panel);
    if (items.length === 0) return;
    const currentIndex = items.findIndex(it => it === document.activeElement);
    let target = currentIndex;
    switch (event.key) {
      case 'ArrowDown':
        target = this.nextEnabled(items, currentIndex, 1);
        break;
      case 'ArrowUp':
        target = this.nextEnabled(items, currentIndex, -1);
        break;
      case 'Home':
        target = this.nextEnabled(items, -1, 1);
        break;
      case 'End':
        target = this.nextEnabled(items, items.length, -1);
        break;
      default:
        return; // let the browser handle other keys (Tab trap is via cdkTrapFocus)
    }
    event.preventDefault();
    if (target >= 0 && target !== currentIndex) {
      items[target].focus();
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

  /** Collect menuitem elements inside the panel (roving-tabindex walker). */
  private collectItems(panel: HTMLElement): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"], .zm-menu__item'));
  }

  /** First non-disabled item (or null). */
  private firstEnabled(items: HTMLElement[]): number {
    return this.nextEnabled(items, -1, 1);
  }

  /** Next enabled item index from `from` in direction `dir` (wraps). */
  private nextEnabled(items: HTMLElement[], from: number, dir: 1 | -1): number {
    const n = items.length;
    if (n === 0) return -1;
    for (let step = 1; step <= n; step++) {
      const idx = ((from + dir * step) % n + n) % n;
      const el = items[idx];
      if (!this.isDisabledItem(el)) return idx;
    }
    return from < 0 ? -1 : from;
  }

  /** An item is disabled when it carries `aria-disabled="true"` or the
   *  `disabled` attribute or the `.is-disabled` class. */
  private isDisabledItem(el: HTMLElement): boolean {
    return (
      el.getAttribute('aria-disabled') === 'true' ||
      el.hasAttribute('disabled') ||
      el.classList.contains('is-disabled')
    );
  }

  /** Build the flexible-connected position strategy anchored to `origin`. */
  private buildPosition(origin: HTMLElement): FlexibleConnectedPositionStrategy {
    return this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withFlexibleDimensions(false)
      .withViewportMargin(8)
      .withPositions([
        // Preferred: below the trigger, aligned to its start edge.
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6, offsetX: 0 },
        // Above the trigger when no room below.
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6, offsetX: 0 },
        // Below, aligned to end.
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6, offsetX: 0 },
        // Above, aligned to end.
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6, offsetX: 0 },
      ]);
  }

  protected readonly durationToken = ZM_DURATION.fast;
  protected readonly easeToken = ZM_EASE.enter;

  protected get hostEl(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
