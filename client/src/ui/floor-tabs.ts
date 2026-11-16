// Abas da barra de andar: contagens por andar. Fica na UI (usa computeCounters de ui/model) e não na lógica de
// andar do mundo: a cena Visita importa world/floor.ts e não pode puxar ui/.
import type { OfficeSnapshot } from '../../../shared/types';
import { floorList, floorOfRoom } from '../world/floor';
import { computeCounters } from './model';

export interface FloorTab {
  id: string;
  name: string;
  agents: number;
  working: number;
  waiting: number;
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
