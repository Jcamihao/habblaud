import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, PtyInfo, RoomInfo } from '../../../shared/types';
import { GROUND, filterSnapshotByFloor, floorOfSelection, floorTabs, visibleFloor } from './floor';

const room = (id: string, floor?: string): RoomInfo =>
  ({ id, name: id, path: id, slot: 0, floor }) as unknown as RoomInfo;

const agent = (id: string, roomId: string, status: AgentInfo['status']): AgentInfo =>
  ({ id, roomId, status, statusSince: 1, kind: 'main', name: id }) as unknown as AgentInfo;

const pty = (id: string, agentId: string): PtyInfo =>
  ({ id, agentId, pid: 1, cwd: '/', account: 'a', startedAt: 0 }) as unknown as PtyInfo;

function snapshot(extra: Partial<OfficeSnapshot> = {}): OfficeSnapshot {
  return {
    rev: 1,
    serverTime: 0,
    rooms: [room('/c/solto'), room('/c/g/Triluga', '/c/g'), room('/c/g/Agilis', '/c/g'), room('/c/h/X', '/c/h')],
    floors: [
      { id: '/c/g', name: 'g' },
      { id: '/c/h', name: 'h' },
    ],
    agents: [
      agent('a1', '/c/g/Triluga', 'waiting'),
      agent('a2', '/c/g/Agilis', 'working'),
      agent('a3', '/c/h/X', 'idle'),
      agent('a4', '/c/solto', 'working'),
    ],
    ptys: [pty('p1', 'a1'), pty('p3', 'a3'), pty('p4', 'a4')],
    accounts: [],
    meta: {} as OfficeSnapshot['meta'],
    ...extra,
  } as OfficeSnapshot;
}

describe('floorTabs', () => {
  it('devolve térreo + andares com contagens do snapshot inteiro', () => {
    const tabs = floorTabs(snapshot());
    expect(tabs.map((t) => t.id)).toEqual([GROUND, '/c/g', '/c/h']);
    expect(tabs[0].name).toBe('Térreo');
    const g = tabs.find((t) => t.id === '/c/g')!;
    expect(g.agents).toBe(2);
    expect(g.working).toBe(1);
    expect(g.waiting).toBe(1);
    expect(tabs.find((t) => t.id === '/c/h')!.agents).toBe(1);
  });

  it('devolve [] sem snapshot, sem floors ou com floors vazio', () => {
    expect(floorTabs(null)).toEqual([]);
    expect(floorTabs(snapshot({ floors: undefined }))).toEqual([]);
    expect(floorTabs(snapshot({ floors: [] }))).toEqual([]);
  });

  it('não mostra o térreo quando nenhuma sala está nele', () => {
    const snap = snapshot({ rooms: [room('/c/g/Triluga', '/c/g')], floors: [{ id: '/c/g', name: 'g' }], agents: [agent('a1', '/c/g/Triluga', 'idle')] });
    expect(floorTabs(snap).map((t) => t.id)).toEqual(['/c/g']);
  });
});

describe('visibleFloor', () => {
  it('mantém o andar pedido quando ele existe', () => {
    expect(visibleFloor(snapshot(), '/c/h')).toBe('/c/h');
    expect(visibleFloor(snapshot(), GROUND)).toBe(GROUND);
  });

  it('cai no primeiro tab quando o andar pedido sumiu', () => {
    expect(visibleFloor(snapshot(), '/c/removido')).toBe(GROUND);
  });

  it('sem o térreo vivo, GROUND cai no primeiro andar', () => {
    const snap = snapshot({ rooms: [room('/c/g/Triluga', '/c/g')], floors: [{ id: '/c/g', name: 'g' }], agents: [] });
    expect(visibleFloor(snap, GROUND)).toBe('/c/g');
  });

  it('sem tabs devolve GROUND', () => {
    expect(visibleFloor(null, '/c/g')).toBe(GROUND);
    expect(visibleFloor(snapshot({ floors: [] }), '/c/g')).toBe(GROUND);
  });
});

describe('filterSnapshotByFloor', () => {
  it('mantém só salas, agentes e ptys do andar', () => {
    const out = filterSnapshotByFloor(snapshot(), '/c/g');
    expect(out.rooms.map((r) => r.id)).toEqual(['/c/g/Triluga', '/c/g/Agilis']);
    expect(out.agents.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(out.ptys!.map((p) => p.id)).toEqual(['p1']);
    expect(out.floors).toEqual(snapshot().floors);
    expect(out.rev).toBe(1);
  });

  it('térreo filtra salas sem floor', () => {
    const out = filterSnapshotByFloor(snapshot(), GROUND);
    expect(out.rooms.map((r) => r.id)).toEqual(['/c/solto']);
    expect(out.agents.map((a) => a.id)).toEqual(['a4']);
  });

  it('sem floors devolve a mesma referência', () => {
    const snap = snapshot({ floors: undefined });
    expect(filterSnapshotByFloor(snap, '/c/g')).toBe(snap);
  });

  it('floors vazio também devolve a mesma referência', () => {
    const snap = snapshot({ floors: [] });
    expect(filterSnapshotByFloor(snap, '/c/g')).toBe(snap);
  });
});

describe('floorOfSelection', () => {
  it('acha o andar de um agente', () => {
    expect(floorOfSelection(snapshot(), { type: 'agent', id: 'a1' })).toBe('/c/g');
    expect(floorOfSelection(snapshot(), { type: 'agent', id: 'a4' })).toBe(GROUND);
  });

  it('acha o andar de uma sala', () => {
    expect(floorOfSelection(snapshot(), { type: 'room', id: '/c/h/X' })).toBe('/c/h');
    expect(floorOfSelection(snapshot(), { type: 'room', id: '/c/solto' })).toBe(GROUND);
  });

  it('devolve undefined para id desconhecido e para seleção nula', () => {
    expect(floorOfSelection(snapshot(), { type: 'agent', id: 'nope' })).toBeUndefined();
    expect(floorOfSelection(snapshot(), { type: 'room', id: 'nope' })).toBeUndefined();
    expect(floorOfSelection(snapshot(), null)).toBeUndefined();
    expect(floorOfSelection(null, { type: 'agent', id: 'a1' })).toBeUndefined();
  });
});
