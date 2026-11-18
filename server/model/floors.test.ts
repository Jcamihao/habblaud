import { describe, expect, it } from 'vitest';
import { FloorSlots, floorInfos, floorOf, parseFloors, roomKey } from './floors';
import { loadConfig } from '../config';

describe('floorOf', () => {
  it('acha a gerência do cwd', () => {
    expect(floorOf('/c/codeStage/Triluga/x', ['/c/codeStage', '/c/praxis.'])).toBe('/c/codeStage');
  });

  it('não casa prefixo de texto: /c/praxis.x/a não está em /c/praxis.', () => {
    expect(floorOf('/c/praxis.x/a', ['/c/praxis.'])).toBeUndefined();
  });

  it('casa a própria raiz da gerência e pastas dentro dela', () => {
    expect(floorOf('/c/praxis.', ['/c/praxis.'])).toBe('/c/praxis.');
    expect(floorOf('/c/praxis./rh', ['/c/praxis.'])).toBe('/c/praxis.');
  });

  it('gerências aninhadas: vale a mais específica (a mais longa)', () => {
    expect(floorOf('/c/g/x', ['/c', '/c/g'])).toBe('/c/g');
    expect(floorOf('/c/y', ['/c', '/c/g'])).toBe('/c');
  });

  it('gerências irmãs com prefixo de texto em comum não se confundem', () => {
    expect(floorOf('/c/gg/x', ['/c/g', '/c/gg'])).toBe('/c/gg');
    expect(floorOf('/c/g/x', ['/c/gg', '/c/g'])).toBe('/c/g');
    expect(floorOf('/c/gx', ['/c/g'])).toBeUndefined();
  });

  it('normaliza o cwd: barras repetidas e barra final', () => {
    expect(floorOf('/c/g//x/', ['/c/g'])).toBe('/c/g');
    expect(floorOf('/c/g/', ['/c/g'])).toBe('/c/g');
  });

  it('cwd fora de qualquer gerência: undefined', () => {
    expect(floorOf('/outro/lugar', ['/c/g'])).toBeUndefined();
    expect(floorOf('/c/g', [])).toBeUndefined();
  });
});

describe('roomKey', () => {
  it('colapsa subpasta no primeiro filho da gerência', () => {
    expect(roomKey('/c/g/Triluga/client/src', ['/c/g'])).toBe('/c/g/Triluga');
    expect(roomKey('/c/g/Triluga', ['/c/g'])).toBe('/c/g/Triluga');
  });

  it('a raiz da gerência é sala própria', () => {
    expect(roomKey('/c/g', ['/c/g'])).toBe('/c/g');
  });

  it('normaliza o cwd dentro da gerência', () => {
    expect(roomKey('/c/g//Triluga//client/', ['/c/g'])).toBe('/c/g/Triluga');
    expect(roomKey('/c/g/', ['/c/g'])).toBe('/c/g');
  });

  it('gerências aninhadas: colapsa pela mais específica', () => {
    expect(roomKey('/c/g/x/y', ['/c', '/c/g'])).toBe('/c/g/x');
    expect(roomKey('/c/y/z', ['/c', '/c/g'])).toBe('/c/y');
  });

  it('fora de gerência só normaliza', () => {
    expect(roomKey('/x/y//', [])).toBe('/x/y');
    expect(roomKey('/c/solto/app/', ['/c/g'])).toBe('/c/solto/app');
  });

  it('não colapsa pasta de outro prefixo de texto', () => {
    expect(roomKey('/c/praxis.x/a', ['/c/praxis.'])).toBe('/c/praxis.x/a');
  });
});

describe('parseFloors', () => {
  it('separa, normaliza e descarta o que não vale, avisando cada descarte', () => {
    expect(parseFloors(' /a , a/b,/a,,/ ,/b/ ')).toEqual({
      floors: ['/a', '/b'],
      warnings: ['a/b', '/a', '', '/'],
    });
  });

  it('barra final e `//` não escapam do descarte', () => {
    expect(parseFloors('/a,/a/,//,   ')).toEqual({ floors: ['/a'], warnings: ['/a/', '//', ''] });
  });

  it('ausente ou vazia: lista vazia e sem avisos', () => {
    expect(parseFloors(undefined)).toEqual({ floors: [], warnings: [] });
    expect(parseFloors('')).toEqual({ floors: [], warnings: [] });
  });

  it('loadConfig lê HABBLAUD_FLOORS', () => {
    const cfg = loadConfig({ HABBLAUD_FLOORS: '/a,/b', HOME: '/tmp' }, []);
    expect(cfg.floors).toEqual(['/a', '/b']);
    expect(cfg.floorWarnings).toEqual([]);
  });
});

describe('floorInfos', () => {
  it('só os andares vivos, na ordem de floors, com nome do basename', () => {
    const infos = floorInfos(['/c/g', '/c/h', '/c/k'], new Set(['/c/k', '/c/g']));
    expect(infos).toEqual([
      { id: '/c/g', name: 'g' },
      { id: '/c/k', name: 'k' },
    ]);
  });

  it('desambigua andares com o mesmo basename', () => {
    const infos = floorInfos(['/a/x', '/b/x'], new Set(['/a/x', '/b/x']));
    expect(infos.map((i) => i.name)).toEqual(['a/x', 'b/x']);
  });
});

describe('FloorSlots', () => {
  it('vaga 0 pode repetir entre andares diferentes', () => {
    const slots = new FloorSlots();
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/g/Triluga', '/c/g'],
        ['/c/h/Agilis', '/c/h'],
      ]),
      0,
    );
    expect(slots.slotOf('/c/g/Triluga')).toBe(0);
    expect(slots.slotOf('/c/h/Agilis')).toBe(0);
  });

  it('segunda sala no mesmo andar pega a vaga 1', () => {
    const slots = new FloorSlots();
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/g/A', '/c/g'],
        ['/c/g/B', '/c/g'],
        ['/c/solto', undefined],
      ]),
      0,
    );
    expect(slots.slotOf('/c/g/A')).toBe(0);
    expect(slots.slotOf('/c/g/B')).toBe(1);
    expect(slots.slotOf('/c/solto')).toBe(0);
  });

  it('saída libera a vaga só no andar dela e respeita o cooldown', () => {
    const slots = new FloorSlots(1000);
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/g/A', '/c/g'],
        ['/c/h/B', '/c/h'],
      ]),
      0,
    );
    // A sai no instante 100: vaga 0 de /c/g fica em cooldown até 1100.
    const changed = slots.sync(new Map<string, string | undefined>([['/c/h/B', '/c/h']]), 100);
    expect(changed).toBe(true);
    expect(slots.slotOf('/c/g/A')).toBeUndefined();
    // Nova sala em /c/g antes do cooldown não pega a 0; em /c/h a vaga 0 continua ocupada por B.
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/h/B', '/c/h'],
        ['/c/g/C', '/c/g'],
      ]),
      500,
    );
    expect(slots.slotOf('/c/g/C')).toBe(1);
    // Depois do cooldown, a vaga 0 volta a ser usada no andar /c/g.
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/h/B', '/c/h'],
        ['/c/g/C', '/c/g'],
        ['/c/g/D', '/c/g'],
      ]),
      2000,
    );
    expect(slots.slotOf('/c/g/D')).toBe(0);
  });

  it('cooldown de um andar não vaza para outro andar', () => {
    const slots = new FloorSlots(1000);
    slots.sync(new Map<string, string | undefined>([['/c/g/A', '/c/g']]), 0);
    slots.sync(new Map<string, string | undefined>(), 100);
    slots.sync(new Map<string, string | undefined>([['/c/k/B', '/c/k']]), 200);
    expect(slots.slotOf('/c/k/B')).toBe(0);
    // No andar de saída o cooldown vale: a sala nova pula a vaga 0.
    slots.sync(
      new Map<string, string | undefined>([
        ['/c/k/B', '/c/k'],
        ['/c/g/C', '/c/g'],
      ]),
      300,
    );
    expect(slots.slotOf('/c/g/C')).toBe(1);
  });

  it('sync sem mudança devolve false', () => {
    const slots = new FloorSlots();
    const rooms = new Map<string, string | undefined>([['/c/g/A', '/c/g']]);
    slots.sync(rooms, 0);
    expect(slots.sync(rooms, 1)).toBe(false);
  });
});
