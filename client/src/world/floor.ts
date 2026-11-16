// Lógica pura de andar no cliente: abas de andar, andar visível, filtro do snapshot por andar.
// Funções puras (sem DOM). Sem `floors` no snapshot (HABBLAUD_FLOORS ausente) tudo se comporta como antes.
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import { tr } from '../../../shared/i18n';
import { waitingAgents } from '../ui/model';
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

/** Abas de andar: térreo (só se houver sala nele) e depois os andares do snapshot, na ordem do servidor. */
export function floorTabs(snap: OfficeSnapshot | null): FloorTab[] {
  if (!snap || !snap.floors || snap.floors.length === 0) return [];
  const roomFloor = new Map<string, string>();
  for (const room of snap.rooms) roomFloor.set(room.id, floorOfRoom(room));

  const tabFor = (id: string, name: string): FloorTab => {
    const agents: AgentInfo[] = snap.agents.filter((a) => roomFloor.get(a.roomId) === id);
    return {
      id,
      name,
      agents: agents.length,
      working: agents.filter((a) => a.status === 'working').length,
      waiting: waitingAgents(agents).length,
    };
  };

  const tabs: FloorTab[] = [];
  if (snap.rooms.some((r) => floorOfRoom(r) === GROUND)) tabs.push(tabFor(GROUND, tr('Térreo')));
  for (const f of snap.floors) tabs.push(tabFor(f.id, f.name));
  return tabs;
}

/** Andar a mostrar: o pedido, se ainda existir; senão o primeiro tab; sem tabs, o térreo. */
export function visibleFloor(snap: OfficeSnapshot | null, wanted: string): string {
  const tabs = floorTabs(snap);
  if (tabs.length === 0) return GROUND;
  if (tabs.some((t) => t.id === wanted)) return wanted;
  return tabs[0].id;
}

/** Recorta o snapshot a um andar. Sem `floors`, devolve o próprio snapshot (mesma referência). */
export function filterSnapshotByFloor(snap: OfficeSnapshot, floorId: string): OfficeSnapshot {
  if (!snap.floors || snap.floors.length === 0) return snap;
  const rooms = snap.rooms.filter((r) => floorOfRoom(r) === floorId);
  const roomIds = new Set(rooms.map((r) => r.id));
  const agents = snap.agents.filter((a) => roomIds.has(a.roomId));
  const agentIds = new Set(agents.map((a) => a.id));
  const ptys = snap.ptys?.filter((p) => agentIds.has(p.agentId));
  return { ...snap, rooms, agents, ptys };
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
