import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, PtyInfo, RoomInfo } from '../../../shared/types';
import { GROUND } from '../world/floor';
import { computeCounters } from './model';
import { floorTabs } from './floor-tabs';

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

describe('floorTabs: mesma regra do contador do topo', () => {
  it('não conta agente offline em nenhuma contagem', () => {
    const snap = snapshot({ agents: [agent('a1', '/c/g/Triluga', 'offline'), agent('a2', '/c/g/Agilis', 'waiting')] });
    const g = floorTabs(snap).find((t) => t.id === '/c/g')!;
    expect(g.agents).toBe(1);
    expect(g.waiting).toBe(1);
    expect(floorTabs(snap).find((t) => t.id === '/c/h')!.agents).toBe(0);
  });

  it('conta subagente presente em agents; done conta em agents mas não em working nem waiting', () => {
    const sub = { ...agent('s1', '/c/g/Triluga', 'working'), kind: 'sub', parentId: 'a1' } as unknown as AgentInfo;
    const snap = snapshot({ agents: [agent('a1', '/c/g/Triluga', 'idle'), sub, agent('a2', '/c/g/Agilis', 'done')] });
    const g = floorTabs(snap).find((t) => t.id === '/c/g')!;
    expect(g).toMatchObject({ agents: 3, working: 1, waiting: 0 });
  });

  it('working parado num comando longo em primeiro plano não conta como working (como no topo)', () => {
    const slow = { ...agent('a1', '/c/g/Triluga', 'working'), shells: [{ id: 'j', kind: 'shell', background: false, startedAt: 0 }] } as unknown as AgentInfo;
    const snap = snapshot({ agents: [slow, agent('a2', '/c/g/Agilis', 'working')] });
    expect(floorTabs(snap, 60_000).find((t) => t.id === '/c/g')!.working).toBe(1);
    expect(floorTabs(snap, 1_000).find((t) => t.id === '/c/g')!.working).toBe(2);
  });

  it('a soma dos andares bate com computeCounters do snapshot inteiro', () => {
    const snap = snapshot({
      agents: [
        agent('a1', '/c/g/Triluga', 'waiting'),
        agent('a2', '/c/g/Agilis', 'working'),
        agent('a3', '/c/h/X', 'offline'),
        agent('a4', '/c/solto', 'waiting'),
        agent('a5', '/c/solto', 'done'),
      ],
    });
    const tabs = floorTabs(snap, 5);
    const total = computeCounters(snap, 5);
    expect(tabs.reduce((n, t) => n + t.agents, 0)).toBe(total.agents);
    expect(tabs.reduce((n, t) => n + t.working, 0)).toBe(total.working);
    expect(tabs.reduce((n, t) => n + t.waiting, 0)).toBe(total.waiting);
  });

  it('agente com sala fora do snapshot não entra em nenhum andar', () => {
    const snap = snapshot({ agents: [agent('x', '/c/some', 'waiting')] });
    expect(floorTabs(snap).every((t) => t.agents === 0 && t.waiting === 0)).toBe(true);
  });
});
