import { describe, expect, it } from 'vitest';
import { orderBy } from './roomorder';

type R = { id: string; floor: string };
const r = (id: string, floor: string): R => ({ id, floor });
const ids = (l: R[]) => l.map((x) => x.id);

describe('orderBy (ordem manual das salas)', () => {
  const list = [r('a', ''), r('b', 'g'), r('c', 'g'), r('d', 'h'), r('e', 'h')];

  it('sem ordem guardada devolve a lista como veio', () => {
    const out = orderBy(list, (x) => x.id, []);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out).not.toBe(list);
  });
  it('sem andares a ordem guardada vale na lista inteira, e o que não está guardado vai para o fim', () => {
    expect(ids(orderBy(list, (x) => x.id, ['e', 'a', 'c']))).toEqual(['e', 'a', 'c', 'b', 'd']);
  });
  it('com andares a ordem guardada vale só dentro de cada andar', () => {
    const out = orderBy(list, (x) => x.id, ['e', 'c', 'b', 'a', 'd'], (x) => x.floor);
    expect(ids(out)).toEqual(['a', 'c', 'b', 'e', 'd']);
  });
  it('a ordem dos andares é a de entrada, mesmo que a guardada ponha uma sala de outro andar antes', () => {
    const out = orderBy(list, (x) => x.id, ['d', 'e', 'b', 'c', 'a'], (x) => x.floor);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('sala nova (não guardada) vai para o fim do próprio andar, não do prédio', () => {
    const out = orderBy([...list, r('f', 'g')], (x) => x.id, ['c', 'b'], (x) => x.floor);
    expect(ids(out)).toEqual(['a', 'c', 'b', 'f', 'd', 'e']);
  });
  it('não altera a lista de entrada', () => {
    const copy = list.slice();
    orderBy(list, (x) => x.id, ['e'], (x) => x.floor);
    expect(list).toEqual(copy);
  });
});
