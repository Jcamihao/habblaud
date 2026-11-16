// Ordem das salas na lista lateral escolhida pelo usuário (arrastando o cabeçalho da sala), guardada no navegador
// pelo id da sala (a pasta do projeto). Salas que não estão na ordem guardada vão para o fim, na ordem em que vieram.
// Com andares (HABBLAUD_FLOORS) a ordem manual vale só dentro de cada andar; a ordem dos andares é fixa.
const ORDER_KEY = 'habblaud.rooms.order';
/** Salas lembradas (as mais recentes da lista). */
const MAX_ROOMS = 100;

/**
 * Aplica a ordem guardada. Com `sectionOf` (andares), a ordem guardada vale só dentro de cada seção: as seções ficam na
 * ordem em que aparecem em `items` (o chamador já as ordenou) e nunca se misturam. Sem `sectionOf`, é uma lista só.
 */
export function orderRooms<T>(items: readonly T[], idOf: (item: T) => string, sectionOf?: (item: T) => string): T[] {
  return orderBy(items, idOf, loadOrder(), sectionOf);
}

/** Núcleo puro de `orderRooms` (a ordem guardada entra por parâmetro). */
export function orderBy<T>(items: readonly T[], idOf: (item: T) => string, saved: readonly string[], sectionOf?: (item: T) => string): T[] {
  if (!saved.length) return items.slice();
  const rank = new Map(saved.map((id, i) => [id, i]));
  const sections = new Map<string, number>();
  if (sectionOf) for (const item of items) if (!sections.has(sectionOf(item))) sections.set(sectionOf(item), sections.size);
  return items
    .map((item, i) => ({ item, i, s: sectionOf ? sections.get(sectionOf(item))! : 0, r: rank.get(idOf(item)) }))
    .sort((x, y) => x.s - y.s || (x.r ?? Infinity) - (y.r ?? Infinity) || x.i - y.i)
    .map((x) => x.item);
}

/** Põe a sala `from` antes (ou depois) de `to` na lista `shown` (ids na ordem mostrada) e guarda. */
export function moveRoom(shown: readonly string[], from: string, to: string, after: boolean): boolean {
  if (from === to || !shown.includes(from) || !shown.includes(to)) return false;
  const rest = shown.filter((id) => id !== from);
  rest.splice(rest.indexOf(to) + (after ? 1 : 0), 0, from);
  // salas guardadas que não estão na lista agora (fechadas ou filtradas) mantêm a posição relativa no fim
  const old = loadOrder().filter((id) => !rest.includes(id));
  saveOrder([...rest, ...old].slice(0, MAX_ROOMS));
  return true;
}

function loadOrder(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveOrder(ids: string[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    // sem armazenamento: a ordem vale só até recarregar
  }
}
