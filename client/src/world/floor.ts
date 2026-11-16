// Lógica pura de andar no cliente: abas de andar, andar visível, filtro do snapshot por andar.
// Funções puras (sem DOM). Sem `floors` no snapshot (HABBLAUD_FLOORS ausente) tudo se comporta como antes.
import type { OfficeSnapshot, RoomInfo } from '../../../shared/types';
import { tr } from '../../../shared/i18n';
import { computeCounters } from '../ui/model';
import type { Selection } from './api';

/** Id do térreo: salas sem `floor` no servidor. */
export const GROUND = '';

export interface FloorTab {
  id: string;
  name: string;
  agents: number;
  working: number;
  waiting: number;
}

const floorOfRoom = (room: RoomInfo): string => room.floor ?? GROUND;

/** Andares com aba, na ordem: térreo (só se houver sala nele) e depois os do snapshot, na ordem do servidor. */
function floorList(snap: OfficeSnapshot | null): { id: string; name: string }[] {
  if (!snap || !snap.floors || snap.floors.length === 0) return [];
  const list: { id: string; name: string }[] = [];
  if (snap.rooms.some((r) => floorOfRoom(r) === GROUND)) list.push({ id: GROUND, name: tr('Térreo') });
  for (const f of snap.floors) list.push({ id: f.id, name: f.name });
  return list;
}

/**
 * Abas de andar com contagens sobre o snapshot inteiro. Usam `computeCounters` sobre as salas e os agentes do andar,
 * a mesma regra do topo: só agentes presentes (principais e subagentes, sem os que saem), `working` sem quem espera
 * o shell e `waiting` = "precisa de você". `now` (relógio do servidor) decide quando um comando em primeiro plano
 * já conta como espera de shell. Agente cuja sala não está no snapshot não pertence a nenhum andar.
 */
export function floorTabs(snap: OfficeSnapshot | null, now = Date.now()): FloorTab[] {
  if (!snap) return [];
  const roomFloor = new Map<string, string>();
  for (const room of snap.rooms) roomFloor.set(room.id, floorOfRoom(room));
  return floorList(snap).map(({ id, name }) => {
    const c = computeCounters(
      { rooms: snap.rooms.filter((r) => floorOfRoom(r) === id), agents: snap.agents.filter((a) => roomFloor.get(a.roomId) === id) },
      now,
    );
    return { id, name, agents: c.agents, working: c.working, waiting: c.waiting };
  });
}

/** Andar a mostrar: o pedido, se ainda existir; senão o primeiro tab; sem tabs, o térreo. */
export function visibleFloor(snap: OfficeSnapshot | null, wanted: string): string {
  const list = floorList(snap);
  if (list.length === 0) return GROUND;
  return list.some((t) => t.id === wanted) ? wanted : list[0].id;
}

/** Recorta o snapshot a um andar. Sem `floors`, devolve o próprio snapshot (mesma referência). */
export function filterSnapshotByFloor(snap: OfficeSnapshot, floorId: string): OfficeSnapshot {
  if (!snap.floors || snap.floors.length === 0) return snap;
  const rooms = snap.rooms.filter((r) => floorOfRoom(r) === floorId);
  const roomIds = new Set(rooms.map((r) => r.id));
  const agents = snap.agents.filter((a) => roomIds.has(a.roomId));
  const agentIds = new Set(agents.map((a) => a.id));
  const out: OfficeSnapshot = { ...snap, rooms, agents };
  if (snap.ptys) out.ptys = snap.ptys.filter((p) => agentIds.has(p.agentId));
  return out;
}

/** Andar da sala ou do agente selecionado; undefined se não achar. */
export function floorOfSelection(snap: OfficeSnapshot | null, sel: Selection): string | undefined {
  if (!snap || !sel) return undefined;
  if (sel.type === 'room') {
    const room = snap.rooms.find((r) => r.id === sel.id);
    return room ? floorOfRoom(room) : undefined;
  }
  const agent = snap.agents.find((a) => a.id === sel.id);
  if (!agent) return undefined;
  const room = snap.rooms.find((r) => r.id === agent.roomId);
  return room ? floorOfRoom(room) : undefined;
}
