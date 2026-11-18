// Andares não mudam o pacote do Habblaud World. A projeção (shared/world/projection.ts) recebe das salas só o id
// (`rooms: { id }[]`): `floor` (RoomInfo.floor) e `OfficeSnapshot.floors` nunca chegam a `project`. Por construção, a
// projeção ignora andares locais. Este teste fixa isso: o mesmo escritório, com e sem andares, gera o mesmo pacote
// byte a byte, e os nomes e caminhos das gerências não aparecem no JSON que sobe.
import { describe, expect, it } from 'vitest';
import { hash32, mulberry32 } from '../../shared/hash';
import type { AgentInfo, FloorInfo, RoomInfo } from '../../shared/types';
import { project, type ProjectionInput, type WorldIdSource } from '../../shared/world/projection';

const NOW = 1_760_000_000_000;

/** Ids do mundo determinísticos: a mesma chave gera o mesmo id em toda chamada (arranjo de projection.test.ts). */
class FakeIds implements WorldIdSource {
  private readonly floors = new Map<string, string>();
  private readonly agents = new Map<string, string>();
  private rnd = mulberry32(42);
  private hex(n: number): string {
    let s = '';
    while (s.length < n) s += Math.floor(this.rnd() * 16).toString(16);
    return s;
  }
  floorId(roomId: string): string {
    if (!this.floors.has(roomId)) this.floors.set(roomId, `f_${this.hex(10)}`);
    return this.floors.get(roomId)!;
  }
  agentId(agentId: string): string {
    if (!this.agents.has(agentId)) this.agents.set(agentId, `a_${this.hex(8)}`);
    return this.agents.get(agentId)!;
  }
}

const GERENCIA_G = '/c/g';
const GERENCIA_H = '/c/h';
const NOME_G = 'codeStage-teste';
const NOME_H = 'praxis-teste';

function room(id: string, extra: Partial<RoomInfo> = {}): RoomInfo {
  return { id, name: id.split('/').pop() ?? id, path: id, slot: 0, seed: hash32(id), createdAt: NOW - 1000, ...extra };
}

function agent(id: string, roomId: string, extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
    name: 'Marina',
    look: 'f',
    role: 'Agente principal',
    sessionId: `sess-${id}`,
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: NOW - 60_000,
    lastEventAt: NOW - 1000,
    statusSince: NOW - 5000,
    stats: { toolCalls: 3, tokensIn: 1000, tokensOut: 200, subagents: 0 },
    seed: hash32(id),
    ...extra,
  };
}

/** Três salas e três agentes. Os ids são os mesmos nas duas versões; só `floor` muda. */
function escritorSem(): { rooms: RoomInfo[]; agents: AgentInfo[] } {
  const rooms = [room('/c/g/Triluga'), room('/c/g/Agilis'), room('/c/h/Projeto')];
  const agents = [
    agent('m-1', '/c/g/Triluga', { status: 'working' }),
    agent('m-2', '/c/g/Agilis', { status: 'waiting', waitingFor: 'aprovar' }),
    agent('m-3', '/c/h/Projeto', { status: 'idle' }),
  ];
  return { rooms, agents };
}

function escritorCom(): { rooms: RoomInfo[]; agents: AgentInfo[]; floors: FloorInfo[] } {
  const { agents } = escritorSem();
  const rooms = [
    room('/c/g/Triluga', { floor: GERENCIA_G }),
    room('/c/g/Agilis', { floor: GERENCIA_G }),
    room('/c/h/Projeto', { floor: GERENCIA_H }),
  ];
  const floors: FloorInfo[] = [
    { id: GERENCIA_G, name: NOME_G },
    { id: GERENCIA_H, name: NOME_H },
  ];
  return { rooms, agents, floors };
}

function entrada(rooms: RoomInfo[], agents: AgentInfo[]): ProjectionInput {
  return {
    rooms,
    agents,
    theme: 'none',
    version: '0.11.0',
    options: { compactions: false, tokensVisible: true },
  };
}

describe('andares não mudam o pacote do World', () => {
  it('o pacote com andares é igual ao pacote sem andares', () => {
    const sem = escritorSem();
    const com = escritorCom();

    const semAndares = project(entrada(sem.rooms, sem.agents), new FakeIds(), NOW);
    const comAndares = project(entrada(com.rooms, com.agents), new FakeIds(), NOW);

    expect(comAndares).toEqual(semAndares);
  });

  it('o JSON do pacote não contém caminho nem nome de gerência', () => {
    const com = escritorCom();
    const json = JSON.stringify(project(entrada(com.rooms, com.agents), new FakeIds(), NOW));

    for (const trecho of [GERENCIA_G, GERENCIA_H, NOME_G, NOME_H]) {
      expect(json).not.toContain(trecho);
    }
  });
});
