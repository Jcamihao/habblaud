// createWorld com andares, sem DOM de verdade (canvas falso, laço de desenho parado): troca de andar, snapshot que
// esvazia o andar visível, seleção em outro andar, visita e timelapse. Quem desenha de verdade só o navegador confirma.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import type { OfficeStore } from '../net/store';
import { createWorld } from './index';

const T0 = 1_700_000_000_000;

const room = (id: string, slot: number, floor?: string): RoomInfo => ({ id, name: id, path: id, slot, seed: slot * 99 + 7, createdAt: T0, ...(floor ? { floor } : {}) });

const agent = (id: string, roomId: string, status: AgentInfo['status'] = 'working'): AgentInfo => ({
  id,
  kind: 'main',
  roomId,
  name: id,
  look: 'f',
  role: 'Agente principal',
  sessionId: `s-${id}`,
  account: '.claude',
  status,
  recent: [],
  tasks: [],
  startedAt: T0,
  lastEventAt: T0,
  statusSince: T0,
  stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
  seed: id.length * 1234567,
});

function snap(rooms: RoomInfo[], agents: AgentInfo[], floors?: { id: string; name: string }[], rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms,
    agents,
    ...(floors ? { floors } : {}),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

const FLOORS = [
  { id: '/g', name: 'g' },
  { id: '/h', name: 'h' },
];
// térreo (sem floor) + andares g e h
const ROOMS = [room('/solto', 0), room('/g/a', 0, '/g'), room('/g/b', 1, '/g'), room('/h/x', 0, '/h')];
const AGENTS = [agent('s1', '/solto'), agent('ga', '/g/a'), agent('gb', '/g/b'), agent('hx', '/h/x')];
const FULL = () => snap(ROOMS, AGENTS, FLOORS);

type FakeStore = { snapshot: OfficeSnapshot | null; emit(s: OfficeSnapshot): void; listeners(): number };

function fakeStore(initial: OfficeSnapshot | null): FakeStore {
  const cbs = new Set<(s: OfficeSnapshot) => void>();
  const s = {
    snapshot: initial,
    on: (ev: string, cb: (s: OfficeSnapshot) => void) => {
      if (ev === 'snapshot') cbs.add(cb);
      return () => void cbs.delete(cb);
    },
    emit(next: OfficeSnapshot) {
      s.snapshot = next;
      cbs.forEach((cb) => cb(next));
    },
    listeners: () => cbs.size,
  };
  return s as FakeStore;
}

// contexto 2D que aceita qualquer chamada: o laço de desenho roda de verdade, sem pintar nada
const ctx2d = (): CanvasRenderingContext2D => {
  const fn: (...a: unknown[]) => unknown = () => proxy;
  const store: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 5 }) : k === Symbol.toPrimitive ? () => 0 : k in store ? store[k] : fn),
    set: (_t, k, v) => ((store[k] = v), true),
  });
  return proxy as CanvasRenderingContext2D;
};

const canvas = () =>
  Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, width: 800, height: 600, style: {}, getContext: () => ctx2d() }) as unknown as HTMLCanvasElement;

const chars = (w: ReturnType<typeof createWorld>) => (w.debug.state() as { chars: { id: string }[] }).chars.map((c) => c.id).sort();
const rooms = (w: ReturnType<typeof createWorld>) => (w.debug.state() as { rooms: { id: string }[] }).rooms.map((r) => r.id).sort();

let raf: ((ts: number) => void) | null = null;
let clock = 0;
/** Roda `n` quadros do laço do mundo (o último requestAnimationFrame pedido). */
const frames = (n: number) => {
  for (let i = 0; i < n; i++) raf?.((clock += 16));
};

describe('createWorld com andares', () => {
  const worlds: ReturnType<typeof createWorld>[] = [];
  const mk = (store: FakeStore, o?: Parameters<typeof createWorld>[2]) => {
    const w = createWorld(canvas(), store as unknown as OfficeStore, o);
    worlds.push(w);
    return w;
  };
  beforeEach(() => {
    vi.stubGlobal('document', Object.assign(new EventTarget(), { fonts: new EventTarget(), createElement: () => canvas() }));
    vi.stubGlobal('window', new EventTarget());
    raf = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (ts: number) => void) => ((raf = cb), 1)));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
  });
  afterEach(() => {
    worlds.splice(0).forEach((w) => w.destroy());
    vi.unstubAllGlobals();
  });

  it('a) boot com snapshot pronto e térreo vazio: abre no primeiro andar, sem erro e sem personagem de outro andar', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = fakeStore(snap(ROOMS.slice(1), AGENTS.slice(1), FLOORS));
    const w = mk(store);
    expect(w.floor?.()).toBe('/g');
    expect(rooms(w)).toEqual(['/g/a', '/g/b']);
    expect(chars(w)).toEqual(['ga', 'gb']);
    expect(err).not.toHaveBeenCalled();
  });

  it('b) o andar visível esvazia: cai em outro andar, personagens entram já no lugar, avisa uma vez', () => {
    const store = fakeStore(null);
    const w = mk(store);
    const cb = vi.fn();
    w.onFloor?.(cb);
    store.emit(FULL());
    expect(w.floor?.()).toBe('');
    expect(chars(w)).toEqual(['s1']);
    w.setFloor?.('/g');
    cb.mockClear();
    // g some do snapshot
    store.emit(snap([ROOMS[0], ROOMS[3]], [AGENTS[0], AGENTS[3]], [FLOORS[1]], 2));
    expect(w.floor?.()).toBe('');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('');
    expect(chars(w)).toEqual(['s1']);
    // carga inicial: a sala já nasce pronta (nada de obra)
    const st = w.debug.state() as { rooms: { phase: string }[] };
    expect(st.rooms.every((r) => r.phase === 'ready')).toBe(true);
  });

  it('c) setFloor: mesmo andar não faz nada; outro andar recria o mundo uma vez e avisa uma vez', () => {
    const store = fakeStore(FULL());
    const w = mk(store);
    const cb = vi.fn();
    w.onFloor?.(cb);
    expect(w.floor?.()).toBe('');
    const dbg = w.debug;
    w.setFloor?.('');
    expect(w.debug).toBe(dbg);
    expect(cb).not.toHaveBeenCalled();
    w.setFloor?.('/h');
    expect(w.debug).not.toBe(dbg);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(chars(w)).toEqual(['hx']);
    expect(rooms(w)).toEqual(['/h/x']);
    // depois da troca, snapshots novos continuam chegando ao mundo novo
    store.emit(snap(ROOMS, [...AGENTS, agent('h2', '/h/x')], FLOORS, 2));
    expect(chars(w)).toEqual(['h2', 'hx']);
    // id desconhecido cai no primeiro andar (como o visibleFloor), nunca fica num andar inexistente
    w.setFloor?.('/nao-existe');
    expect(w.floor?.()).toBe('');
  });

  it('d) select com foco em agente de outro andar troca de andar antes; id desconhecido não troca', () => {
    const store = fakeStore(FULL());
    const w = mk(store);
    w.select({ type: 'agent', id: 'nao-existe' }, { focus: true });
    expect(w.floor?.()).toBe('');
    w.select({ type: 'agent', id: 'ga' }, { focus: true });
    expect(w.floor?.()).toBe('/g');
    expect(chars(w)).toContain('ga');
    expect(w.getSelection()).toEqual({ type: 'agent', id: 'ga' });
    w.select({ type: 'room', id: '/h/x' }, { focus: true });
    expect(w.floor?.()).toBe('/h');
    expect(rooms(w)).toContain('/h/x');
  });

  it('e) trocar de andar à mão mantém a seleção', () => {
    const store = fakeStore(FULL());
    const w = mk(store);
    const sel = vi.fn();
    w.onSelect(sel);
    w.select({ type: 'agent', id: 'ga' }, { focus: true });
    sel.mockClear();
    w.setFloor?.('/h');
    expect(w.getSelection()).toEqual({ type: 'agent', id: 'ga' });
    expect(sel).not.toHaveBeenCalled();
  });

  it('f) timelapse: o andar atual e o filtro valem em cada snapshot e ao entrar/sair', () => {
    const store = fakeStore(FULL());
    const w = mk(store);
    w.setFloor?.('/g');
    let t = T0;
    w.setPlayback?.({ clock: () => t, scale: () => 1 });
    expect(w.floor?.()).toBe('/g');
    store.emit(snap(ROOMS, AGENTS, FLOORS, 3));
    expect(chars(w)).toEqual(['ga', 'gb']);
    t += 1000;
    store.emit(snap(ROOMS, [...AGENTS, agent('g3', '/g/a')], FLOORS, 4));
    expect(chars(w)).toEqual(['g3', 'ga', 'gb']);
    w.setPlayback?.(null);
    expect(w.floor?.()).toBe('/g');
    store.emit(snap(ROOMS, AGENTS, FLOORS, 5));
    expect(chars(w)).toEqual(['ga', 'gb']);
  });

  it('g) visita: sempre o térreo, snapshot sem filtro, setFloor ignorado', () => {
    const store = fakeStore(FULL());
    const w = mk(store, { visit: true });
    expect(w.floor?.()).toBe('');
    expect(chars(w)).toEqual(['ga', 'gb', 'hx', 's1']);
    const dbg = w.debug;
    w.setFloor?.('/g');
    expect(w.floor?.()).toBe('');
    expect(w.debug).toBe(dbg);
    w.select({ type: 'agent', id: 'hx' }, { focus: true });
    expect(w.floor?.()).toBe('');
    expect(w.debug).toBe(dbg);
    // mesmo sem sala no térreo, a visita não troca de andar nem filtra
    store.emit(snap(ROOMS.slice(1), AGENTS.slice(1), FLOORS, 2));
    expect(w.floor?.()).toBe('');
    expect(w.debug).toBe(dbg);
    expect(chars(w)).toEqual(expect.arrayContaining(['ga', 'gb', 'hx']));
  });

  it('h) sem floors: nada de rebuild nem de troca, snapshot inteiro', () => {
    const plain = (rev: number) => snap([room('/a', 0), room('/b', 1)], [agent('x', '/a'), agent('y', '/b')], undefined, rev);
    const store = fakeStore(plain(1));
    const w = mk(store);
    const cb = vi.fn();
    w.onFloor?.(cb);
    const dbg = w.debug;
    store.emit(plain(2));
    w.setFloor?.('/qualquer');
    w.select({ type: 'agent', id: 'y' }, { focus: true });
    expect(w.debug).toBe(dbg);
    expect(w.floor?.()).toBe('');
    expect(cb).not.toHaveBeenCalled();
    expect(chars(w)).toEqual(['x', 'y']);
  });

  it('i) destroy limpa os listeners de andar e o do store', () => {
    const store = fakeStore(FULL());
    const w = mk(store);
    const cb = vi.fn();
    w.onFloor?.(cb);
    expect(store.listeners()).toBe(1);
    w.destroy();
    expect(store.listeners()).toBe(0);
    store.emit(FULL());
    w.setFloor?.('/g');
    expect(cb).not.toHaveBeenCalled();
  });

  it('laço: seleção noutro andar continua; some de verdade => solta; seguir sem a pessoa => solta; sem erro de quadro', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = fakeStore(FULL());
    const w = mk(store);
    frames(5);
    w.select({ type: 'agent', id: 'ga' }, { focus: true });
    frames(5);
    expect(w.floor?.()).toBe('/g');
    w.setFloor?.('/h');
    frames(10);
    expect(w.getSelection()).toEqual({ type: 'agent', id: 'ga' });
    // o agente sai do prédio (some do snapshot): aí sim a seleção cai
    store.emit(snap(ROOMS, AGENTS.filter((a) => a.id !== 'ga'), FLOORS, 2));
    frames(5);
    expect(w.getSelection()).toBeNull();
    // sala selecionada noutro andar também sobrevive
    w.select({ type: 'room', id: '/g/b' }, { focus: true });
    frames(5);
    w.setFloor?.('');
    frames(5);
    expect(w.getSelection()).toEqual({ type: 'room', id: '/g/b' });
    expect(err).not.toHaveBeenCalled();
  });

  it('laço: ao trocar de andar a câmera enquadra o prédio novo (limites e zoom mínimo do andar novo)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    // térreo com 1 sala, g com 5 salas: prédios de larguras diferentes
    const many = [0, 1, 2, 3, 4].map((i) => room(`/g/r${i}`, i, '/g'));
    const all = [room('/solto', 0), ...many];
    const ags = [agent('s1', '/solto'), ...many.map((r, i) => agent(`g${i}`, r.id))];
    const store = fakeStore(snap(all, ags, [{ id: '/g', name: 'g' }]));
    const w = mk(store);
    frames(5);
    w.zoomBy?.(1.25); // o usuário mexeu na câmera: o laço não reenquadra sozinho
    frames(30);
    const small = (w.debug.state() as { cols: number }).cols;
    w.setFloor?.('/g');
    frames(60);
    const st = w.debug.state() as { cols: number; camera: { zoom: number } };
    expect(st.cols).toBeGreaterThan(small);
    // o prédio inteiro cabe: o zoom não ficou preso no mínimo do andar pequeno
    w.setFloor?.('');
    frames(60);
    const back = w.debug.state() as { cols: number; camera: { zoom: number } };
    expect(back.cols).toBe(small);
    expect(back.camera.zoom).toBeGreaterThanOrEqual(st.camera.zoom);
    expect(err).not.toHaveBeenCalled();
  });

  it('laço: o andar visível some do snapshot => a câmera enquadra o andar novo mesmo com o usuário tendo mexido nela', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const many = [0, 1, 2, 3, 4].map((i) => room(`/g/r${i}`, i, '/g'));
    const all = [room('/solto', 0), ...many];
    const ags = [agent('s1', '/solto'), ...many.map((r, i) => agent(`g${i}`, r.id))];
    const store = fakeStore(snap(all, ags, [{ id: '/g', name: 'g' }]));
    const w = mk(store);
    frames(5);
    w.setFloor?.('/g');
    frames(60);
    w.zoomBy?.(0.8);
    frames(30);
    const before = (w.debug.state() as { camera: { zoom: number } }).camera.zoom;
    store.emit(snap([room('/solto', 0), room('/h/x', 0, '/h')], [agent('s1', '/solto'), agent('hx', '/h/x')], [{ id: '/h', name: 'h' }], 2));
    frames(60);
    expect(w.floor?.()).toBe('');
    const st = w.debug.state() as { camera: { zoom: number } };
    expect(st.camera.zoom).toBeGreaterThan(before);
    expect(err).not.toHaveBeenCalled();
  });
});
