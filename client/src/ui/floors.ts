// Seletor de andar (HABBLAUD_FLOORS): uma barra de botões, um por andar, com a contagem de agentes e um ponto quando
// algum agente desse andar espera o dono. Fica na barra do topo (ui/index.ts). Sem andares, fica escondida.
import type { UiComponent, UiContext } from './context';
import { floorTabs, type FloorTab } from './floor-tabs';
import { h, KeyedList, setAttr, setHidden, setText, setTitle } from './dom';
import { tr } from '../../../shared/i18n';

export interface FloorBarItem {
  id: string;
  label: string;
  count: string;
  waiting: boolean;
  active: boolean;
}

/** Modelo puro da barra: um item por andar, na ordem das abas. */
export function floorBarModel(tabs: FloorTab[], current: string): FloorBarItem[] {
  return tabs.map((t) => ({
    id: t.id,
    label: t.name,
    count: String(t.agents),
    waiting: t.waiting > 0,
    active: t.id === current,
  }));
}

interface ButtonRefs {
  name: HTMLElement;
  count: HTMLElement;
  dot: HTMLElement;
}

export class FloorBar implements UiComponent {
  readonly el: HTMLElement;
  /** Andar mostrado agora (lido do mundo na montagem e atualizado por onFloor). */
  private current: string;
  private refs = new WeakMap<HTMLButtonElement, ButtonRefs>();
  private buttons: KeyedList<FloorBarItem, HTMLButtonElement>;

  constructor(private ctx: UiContext) {
    this.current = ctx.floor();
    ctx.world.onFloor?.((id) => {
      this.current = id;
      ctx.invalidate();
    });
    this.el = h('div', { class: 'ui-floors', attrs: { role: 'group', 'aria-label': tr('Andares do escritório') } });
    this.buttons = new KeyedList<FloorBarItem, HTMLButtonElement>(this.el, {
      animate: false,
      key: (it) => it.id,
      create: () => this.createButton(),
      update: (btn, it) => this.updateButton(btn, it),
    });
    setHidden(this.el, true);
  }

  render(): void {
    const tabs = floorTabs(this.ctx.store.snapshot, this.ctx.now());
    const items = floorBarModel(tabs, this.current);
    setHidden(this.el, items.length === 0);
    this.buttons.sync(items);
  }

  private createButton(): HTMLButtonElement {
    const name = h('span', { class: 'ui-floor__name' });
    const count = h('span', { class: 'ui-floor__count' });
    const dot = h('span', { class: 'ui-floor__dot', attrs: { 'aria-hidden': 'true' } });
    const btn = h('button', { class: 'ui-floor', type: 'button' }, name, count, dot);
    btn.addEventListener('click', () => this.pick(btn.dataset.id ?? ''));
    this.refs.set(btn, { name, count, dot });
    return btn;
  }

  private updateButton(btn: HTMLButtonElement, it: FloorBarItem): void {
    const r = this.refs.get(btn)!;
    setAttr(btn, 'data-id', it.id);
    setText(r.name, it.label);
    setText(r.count, it.count);
    btn.classList.toggle('is-active', it.active);
    btn.classList.toggle('is-waiting', it.waiting);
    setAttr(btn, 'aria-pressed', it.active ? 'true' : 'false');
    setTitle(btn, it.waiting ? tr('{0}: agente esperando você', [it.label]) : it.label);
  }

  private pick(id: string): void {
    if (id === this.current) return;
    this.ctx.setFloor(id);
    const btn = this.buttons.get(id);
    const label = btn ? this.refs.get(btn)?.name.textContent ?? id : id;
    this.ctx.announce(tr('Andar {0}', [label]));
  }
}
