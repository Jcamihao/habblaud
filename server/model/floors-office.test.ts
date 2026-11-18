import { describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { NameStore } from './names';
import { Office, OFFLINE_GRACE_MS, SLOT_COOLDOWN_MS } from './office';

setQuiet(true);

function makeOffice(floors?: string[]) {
  let clock = 1_000_000;
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: clock,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    now: () => clock,
    ...(floors ? { floors } : {}),
  });
  return { office, advance: (ms: number) => (clock += ms), now: () => clock };
}

const main = (id: string, sessionId: string, cwd: string, now: number) =>
  ({ id, account: 'acc', sessionId, cwd, role: 'Agente principal', startedAt: now, status: 'working' }) as const;

describe('Office: andares por gerência', () => {
  it('sessões dentro de /c/g viram salas do andar /c/g; fora dele, sala sem andar', () => {
    const { office, now } = makeOffice(['/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g/Triluga', now()));
    office.addMain(main('acc:2', 's2', '/c/g/Triluga/client', now()));
    office.addMain(main('acc:3', 's3', '/c/g/Agilis', now()));
    office.addMain(main('acc:4', 's4', '/c/solto', now()));
    const snap = office.commit().snapshot;

    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/solto', '/c/g/Triluga', '/c/g/Agilis']);
    const byId = new Map(snap.rooms.map((r) => [r.id, r]));
    expect(byId.get('/c/g/Triluga')).toMatchObject({ floor: '/c/g', slot: 0, path: '/c/g/Triluga' });
    expect(byId.get('/c/g/Agilis')).toMatchObject({ floor: '/c/g', slot: 1 });
    expect(byId.get('/c/solto')!.slot).toBe(0);
    expect('floor' in byId.get('/c/solto')!).toBe(false);
    expect(snap.floors).toEqual([{ id: '/c/g', name: 'g' }]);
  });

  it('sem floors nas deps: nenhum floor na sala e nenhum floors no snapshot', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/c/g/Triluga/client', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/g/Triluga/client']);
    expect('floor' in snap.rooms[0]).toBe(false);
    expect('floors' in snap).toBe(false);
  });

  it('quando a última sala de /c/g sai, floors deixa de listá-lo', () => {
    const { office, advance, now } = makeOffice(['/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g/Triluga', now()));
    office.addMain(main('acc:2', 's2', '/c/solto', now()));
    expect(office.commit().snapshot.floors).toEqual([{ id: '/c/g', name: 'g' }]);

    office.closeMain('acc:1');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/solto']);
    expect(snap.floors).toEqual([]);
  });

  it('o andar nasce do caminho da sala (roomKey), não do cwd cru: sessão em subpasta não cria sala nem andar à parte', () => {
    const { office, now } = makeOffice(['/c/g', '/c/praxis.']);
    office.addMain(main('acc:1', 's1', '/c/g/Triluga/client/src', now()));
    office.addMain(main('acc:2', 's2', '/c/praxis.x/a', now()));
    office.addMain(main('acc:3', 's3', '/c/praxis./rh/web', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => [r.id, r.path, r.floor])).toEqual([
      ['/c/praxis.x/a', '/c/praxis.x/a', undefined],
      ['/c/g/Triluga', '/c/g/Triluga', '/c/g'],
      ['/c/praxis./rh', '/c/praxis./rh', '/c/praxis.'],
    ]);
    expect(office.get('acc:1')!.roomId).toBe('/c/g/Triluga');
  });

  it('a raiz da gerência é sala própria no andar dela', () => {
    const { office, now } = makeOffice(['/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms).toMatchObject([{ id: '/c/g', floor: '/c/g' }]);
    expect(snap.floors).toEqual([{ id: '/c/g', name: 'g' }]);
  });

  it('ordem: térreo, depois andares na ordem da configuração (não da chegada), dentro do andar pela vaga', () => {
    const { office, now } = makeOffice(['/c/h', '/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g/A', now()));
    office.addMain(main('acc:2', 's2', '/c/h/B', now()));
    office.addMain(main('acc:3', 's3', '/c/h/C', now()));
    office.addMain(main('acc:4', 's4', '/c/solto', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => [r.id, r.slot])).toEqual([
      ['/c/solto', 0],
      ['/c/h/B', 0],
      ['/c/h/C', 1],
      ['/c/g/A', 0],
    ]);
    expect(snap.floors!.map((f) => f.id)).toEqual(['/c/h', '/c/g']);
  });

  it('vagas por andar: a sala nova ocupa a vaga liberada no andar dela, sem mexer nos outros andares', () => {
    const { office, advance, now } = makeOffice(['/c/g', '/c/h']);
    office.addMain(main('acc:1', 's1', '/c/g/A', now()));
    office.addMain(main('acc:2', 's2', '/c/g/B', now()));
    office.addMain(main('acc:3', 's3', '/c/h/C', now()));
    office.commit();
    office.closeMain('acc:1');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    office.commit();
    advance(SLOT_COOLDOWN_MS + 1);
    office.addMain(main('acc:4', 's4', '/c/g/D', now()));
    const slots = new Map(office.commit().snapshot.rooms.map((r) => [r.id, r.slot]));
    expect(slots.get('/c/g/D')).toBe(0);
    expect(slots.get('/c/g/B')).toBe(1);
    expect(slots.get('/c/h/C')).toBe(0);
  });

  it('mesmo nome de pasta em andares diferentes: o nome exibido leva a pasta-mãe para distinguir', () => {
    const { office, now } = makeOffice(['/c/g', '/c/h']);
    office.addMain(main('acc:1', 's1', '/c/g/wa-akg', now()));
    office.addMain(main('acc:2', 's2', '/c/h/wa-akg/src', now()));
    const names = new Map(office.commit().snapshot.rooms.map((r) => [r.id, r.name]));
    expect(names.get('/c/g/wa-akg')).toBe('g/wa-akg');
    expect(names.get('/c/h/wa-akg')).toBe('h/wa-akg');
  });

  it('alias da sala vale pelo caminho da sala (a pasta do projeto)', () => {
    const aliases = new Map([['/c/g/Triluga', 'Tri']]);
    const office = new Office({
      names: new NameStore(null), version: 't', startedAt: 1, accounts: () => [], sources: () => [], accountName: () => undefined,
      now: () => 1, floors: ['/c/g'], roomAlias: (p) => aliases.get(p),
    });
    office.addMain(main('acc:1', 's1', '/c/g/Triluga/client', 1));
    expect(office.commit().snapshot.rooms[0].name).toBe('Tri');
  });

  it('"Assumir aqui" retoma na pasta exata da sessão, não na pasta da sala', () => {
    const { office, now } = makeOffice(['/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g/Triluga/client', now()));
    expect(office.roomPath('/c/g/Triluga')).toBe('/c/g/Triluga');
    expect(office.agentCwd('acc:1')).toBe('/c/g/Triluga/client');
    expect(office.agentCwd('acc:nao-existe')).toBeUndefined();
  });

  it('sala demo não tem andar e não entra em floors', () => {
    const { office, now } = makeOffice(['/c/g']);
    office.addMain(main('acc:1', 's1', '/c/g/A', now()));
    office.setDemo(true);
    const snap = office.commit().snapshot;
    const demo = snap.rooms.filter((r) => r.id !== '/c/g/A');
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((r) => !('floor' in r))).toBe(true);
    expect(snap.floors).toEqual([{ id: '/c/g', name: 'g' }]);
    expect(snap.rooms[snap.rooms.length - 1].id).toBe('/c/g/A');
  });
});
