// Andares por gerência: cada pasta de HABBLAUD_FLOORS vira um andar, e cada pasta de projeto dentro dela vira uma sala.
// Tudo aqui é puro (sem I/O), para o escritório, a configuração e os testes usarem as mesmas regras.
import { SlotAllocator, normalizeCwd, roomDisplayNames } from './rooms';

/**
 * Lê HABBLAUD_FLOORS (caminhos absolutos separados por vírgula). Descarta, com aviso, entrada vazia, relativa,
 * `/` e repetida. Em `warnings` vai a entrada descartada como foi digitada (só sem os espaços das pontas).
 */
export function parseFloors(raw: string | undefined): { floors: string[]; warnings: string[] } {
  const floors: string[] = [];
  const warnings: string[] = [];
  if (!raw?.trim()) return { floors, warnings };
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    const path = normalizeCwd(trimmed);
    if (!trimmed || !path.startsWith('/') || path === '/' || floors.includes(path)) {
      warnings.push(trimmed);
      continue;
    }
    floors.push(path);
  }
  return { floors, warnings };
}

/** Pasta de `cwd` é `floor` ou está dentro dela? Compara por segmento: `/c/praxis.x` não está em `/c/praxis.`. */
function inside(cwd: string, floor: string): boolean {
  return cwd === floor || cwd.startsWith(`${floor}/`);
}

/** Andar do cwd: a gerência mais específica (a mais longa) que contém o cwd. Fora de qualquer gerência, undefined. */
export function floorOf(cwd: string, floors: readonly string[]): string | undefined {
  const path = normalizeCwd(cwd);
  let best: string | undefined;
  for (const floor of floors) {
    if (inside(path, floor) && (best === undefined || floor.length > best.length)) best = floor;
  }
  return best;
}

/**
 * Chave da sala. Fora de gerência, o cwd normalizado. Dentro da gerência `f`, `f` + primeiro segmento abaixo dela:
 * `f/Triluga/client/src` vira a sala `f/Triluga`; a própria raiz `f` é sala própria.
 */
export function roomKey(cwd: string, floors: readonly string[]): string {
  const path = normalizeCwd(cwd);
  const floor = floorOf(path, floors);
  if (floor === undefined || path === floor) return path;
  const first = path.slice(floor.length + 1).split('/')[0];
  return `${floor}/${first}`;
}

/** Nome para comparar: sem acento, minúsculas, só a-z0-9 ("Hora H" == "HoraH", "praxis.rh" == "praxisrh"). */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TEAM_PREFIX = /^\s*trampo\s+d[oae]s?\s+/i;

/** Tira o prefixo "Trampo do/da/de/dos/das" do título, se houver. */
export function stripTeamPrefix(title: string): string {
  return title.replace(TEAM_PREFIX, '').trim();
}

/** Menor começo de nome que pode casar com uma pasta (abaixo disso, "Tri" casaria com muita coisa). */
const MIN_PREFIX = 4;

/**
 * Equipe pelo nome da sessão. Primeiro igualdade exata normalizada: se casar em mais de uma gerência+pasta, é ambíguo
 * (undefined). Sem igualdade, começo de nome (>= 4 letras) que case com exatamente uma pasta em todas as gerências.
 * `projects` mapeia andar -> nomes das pastas filhas.
 */
export function matchTeam(
  title: string | undefined,
  projects: ReadonlyMap<string, readonly string[]>,
): { floor: string; project: string } | undefined {
  if (title === undefined) return undefined;
  const name = normalizeName(stripTeamPrefix(title));
  if (!name) return undefined;
  const all: { floor: string; project: string }[] = [];
  for (const [floor, names] of projects) for (const project of names) all.push({ floor, project });
  const exact = all.filter((c) => normalizeName(c.project) === name);
  if (exact.length > 0) return exact.length === 1 ? exact[0] : undefined;
  if (name.length < MIN_PREFIX) return undefined;
  const prefix = all.filter((c) => normalizeName(c.project).startsWith(name));
  return prefix.length === 1 ? prefix[0] : undefined;
}

/** Sala da equipe: a pasta do projeto dentro da gerência (mesma forma do roomKey). */
export function teamRoomKey(floor: string, project: string): string {
  return `${floor}/${project}`;
}

/** Andares com pelo menos uma sala viva (`alive` traz os caminhos dos andares), na ordem de `floors`, com nome. */
export function floorInfos(floors: readonly string[], alive: ReadonlySet<string>): { id: string; name: string }[] {
  const shown = floors.filter((f) => alive.has(f));
  const names = roomDisplayNames(new Map(shown.map((f) => [f, f])));
  return shown.map((id) => ({ id, name: names.get(id) ?? id }));
}

/**
 * Vagas (slot) por andar: cada andar tem o seu SlotAllocator, então a vaga 0 pode existir em mais de um andar.
 * Sala sem andar fica no grupo próprio (chave ''). Andar sem salas vivas recebe lista vazia e libera as vagas.
 */
export class FloorSlots {
  private byFloor = new Map<string, SlotAllocator>();
  private floorOfRoom = new Map<string, string>();

  constructor(private readonly cooldownMs?: number) {}

  /** `rooms` mapeia id da sala -> andar (ou undefined). Devolve true se alguma vaga mudou. */
  sync(rooms: ReadonlyMap<string, string | undefined>, now: number): boolean {
    const groups = new Map<string, string[]>();
    for (const floor of this.byFloor.keys()) groups.set(floor, []);
    for (const [id, floor] of rooms) {
      const key = floor ?? '';
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    let changed = false;
    for (const [floor, ids] of groups) {
      let allocator = this.byFloor.get(floor);
      if (!allocator) {
        allocator = new SlotAllocator(this.cooldownMs);
        this.byFloor.set(floor, allocator);
      }
      if (allocator.sync(ids, now)) changed = true;
    }
    for (const id of [...this.floorOfRoom.keys()]) {
      if (!rooms.has(id)) this.floorOfRoom.delete(id);
    }
    for (const [id, floor] of rooms) this.floorOfRoom.set(id, floor ?? '');
    return changed;
  }

  slotOf(roomId: string): number | undefined {
    const floor = this.floorOfRoom.get(roomId);
    return floor === undefined ? undefined : this.byFloor.get(floor)?.slotOf(roomId);
  }
}
