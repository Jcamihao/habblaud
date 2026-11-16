import { describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { NameStore } from './names';
import { Office, OFFLINE_GRACE_MS } from './office';

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
});
