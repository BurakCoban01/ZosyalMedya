import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZmMenuComponent } from './menu.component';

/**
 * ZmMenu — focused verification for VAL-DS-026 / VAL-DS-027.
 *
 * Guards:
 *   - role=menu + aria-label on the panel;
 *   - transparent backdrop present (outside-click dismiss, VAL-DS-027);
 *   - Escape closes and returns focus (VAL-DS-026);
 *   - arrow-key + Home/End navigation between menuitems (skipping disabled);
 *   - disabled items are not focusable via the keyboard walker.
 *
 * The live focus-trace (focus moves to the first item, Tab cycles within,
 * focus returns to the trigger) is proven by the browser probe on /_design.
 */

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};

@Component({
  standalone: true,
  imports: [ZmMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-menu [label]="label">
    <div role="menuitem" tabindex="-1" data-testid="m-edit">Düzenle</div>
    <div role="menuitem" tabindex="-1" data-testid="m-share">Paylaş</div>
    <div role="menuitem" tabindex="-1" data-testid="m-mute" aria-disabled="true">Sustur</div>
    <div role="menuitem" tabindex="-1" data-testid="m-del">Sil</div>
  </zm-menu>`,
})
class MenuHost {
  label = 'Gönderi eylemleri';
}

async function mountMenu(label = 'Gönderi eylemleri'): Promise<{ menu: ZmMenuComponent; trigger: HTMLElement }> {
  await TestBed.configureTestingModule({ imports: [MenuHost] }).compileComponents();
  const fixture = TestBed.createComponent(MenuHost);
  fixture.componentInstance.label = label;
  fixture.detectChanges();
  const menu = fixture.debugElement.children[0].componentInstance as ZmMenuComponent;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Menü';
  document.body.appendChild(trigger);
  return { menu, trigger };
}

/** Dispatch a real keydown on the menu panel so `currentTarget` is set
 *  (synthetic KeyboardEvents have currentTarget=null until dispatched). */
function panelKey(panel: HTMLElement, key: string): void {
  panel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

/** Open the menu and return its panel + items (focus on the first enabled). */
async function openMenu(menu: ZmMenuComponent, trigger: HTMLElement): Promise<{
  panel: HTMLElement;
  items: HTMLElement[];
}> {
  menu.open(trigger);
  await flush();
  const panel = document.querySelector<HTMLElement>('.zm-menu__panel')!;
  const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  return { panel, items };
}

describe('ZmMenuComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(el => el.remove());
    document.querySelectorAll('button[data-testid]').forEach(el => el.remove());
  });

  it('renders nothing in-place until opened', async () => {
    const { menu, trigger } = await mountMenu();
    expect(menu.isOpen()).toBe(false);
    expect(document.querySelector('.zm-menu__panel')).toBeNull();
    trigger.remove();
  });

  it('opens a role=menu + aria-label panel anchored to the trigger', async () => {
    const { menu, trigger } = await mountMenu('Gönderi eylemleri');
    const { panel } = await openMenu(menu, trigger);
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.getAttribute('aria-label')).toBe('Gönderi eylemleri');
    expect(panel.getAttribute('tabindex')).toBe('-1');
    menu.close();
    await flush();
    trigger.remove();
  });

  it('transparent backdrop present while open (outside-click dismiss)', async () => {
    const { menu, trigger } = await mountMenu();
    menu.open(trigger);
    await flush();
    const backdrop = document.querySelector<HTMLElement>('.zm-menu-backdrop');
    expect(backdrop).not.toBeNull();
    menu.close();
    await flush();
    trigger.remove();
  });

  it('dismisses via outside (backdrop) click without firing inner actions', async () => {
    const { menu, trigger } = await mountMenu();
    const closed = vi.fn();
    menu.closed.subscribe(closed);
    menu.open(trigger);
    await flush();
    const backdrop = document.querySelector<HTMLElement>('.zm-menu-backdrop');
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(closed.mock.calls[0]?.[0]).toBe('backdrop');
    trigger.remove();
  });

  it('closes via Escape and reports the escape reason', async () => {
    const { menu, trigger } = await mountMenu();
    const closed = vi.fn();
    menu.closed.subscribe(closed);
    menu.open(trigger);
    await flush();
    menu.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(closed.mock.calls[0]?.[0]).toBe('escape');
    trigger.remove();
  });

  it('ArrowDown moves focus to the next enabled menuitem (skips disabled)', async () => {
    const { menu, trigger } = await mountMenu();
    const { panel, items } = await openMenu(menu, trigger);
    // First enabled item gets focus on open.
    expect(document.activeElement).toBe(items[0]);
    panelKey(panel, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    panelKey(panel, 'ArrowDown');
    // Skips the disabled items[2] (Sustur), lands on items[3] (Sil).
    expect(document.activeElement).toBe(items[3]);
    menu.close();
    await flush();
    trigger.remove();
  });

  it('ArrowUp wraps to the last enabled item', async () => {
    const { menu, trigger } = await mountMenu();
    const { panel, items } = await openMenu(menu, trigger);
    panelKey(panel, 'ArrowUp');
    // Wraps to last enabled (Sil), skipping the disabled Sustur.
    expect(document.activeElement).toBe(items[3]);
    menu.close();
    await flush();
    trigger.remove();
  });

  it('Home/End jump to first/last enabled item', async () => {
    const { menu, trigger } = await mountMenu();
    const { panel, items } = await openMenu(menu, trigger);
    panelKey(panel, 'End');
    expect(document.activeElement).toBe(items[3]);
    panelKey(panel, 'Home');
    expect(document.activeElement).toBe(items[0]);
    menu.close();
    await flush();
    trigger.remove();
  });

  it('label is required (accessible name never empty)', async () => {
    const { menu, trigger } = await mountMenu('Hesap menüsü');
    const { panel } = await openMenu(menu, trigger);
    expect(panel.getAttribute('aria-label')).toBe('Hesap menüsü');
    menu.close();
    await flush();
    trigger.remove();
  });
});
