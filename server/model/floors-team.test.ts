import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { loadConfig, parseFloorProjects, scanFloorProjects } from '../config';
import { NameStore } from './names';
import { Office, OFFLINE_GRACE_MS } from './office';
import { matchTeam, normalizeName, stripTeamPrefix, teamRoomKey } from './floors';

setQuiet(true);

const PROJECTS = new Map<string, readonly string[]>([
  ['/c/codeStage', ['Agilis', 'HoraH', 'Lumen', 'SelahIA', 'Triluga', 'wa-akg']],
  ['/c/praxis.', ['praxis.rh', 'praxis.psi', 'stem-machine', 'wa-akg']],
]);

describe('normalizeName', () => {
  it('tira acento, caixa e tudo que não é a-z0-9', () => {
    expect(normalizeName('Hora H')).toBe('horah');
    expect(normalizeName('praxis.rh')).toBe('praxisrh');
    expect(normalizeName('Ação-Ç 9')).toBe('acaoc9');
  });
});

describe('stripTeamPrefix', () => {
  it('tira "Trampo do/da/de/dos/das" sem diferenciar caixa', () => {
    expect(stripTeamPrefix('Trampo do Agilis')).toBe('Agilis');
    expect(stripTeamPrefix('TRAMPO DA LUMEN')).toBe('LUMEN');
    expect(stripTeamPrefix('trampo de Triluga')).toBe('Triluga');
    expect(stripTeamPrefix('Trampo dos X')).toBe('X');
    expect(stripTeamPrefix('Trampo das Y')).toBe('Y');
  });

  it('sem prefixo, devolve o título (sem as pontas)', () => {
    expect(stripTeamPrefix('  Agilis ')).toBe('Agilis');
  });
});

describe('matchTeam', () => {
  it.each([
    ['Trampo do Agilis', '/c/codeStage', 'Agilis'],
    ['Trampo do Hora H', '/c/codeStage', 'HoraH'],
    ['Trampo do SELAH', '/c/codeStage', 'SelahIA'],
    ['Trampo do praxis.rh', '/c/praxis.', 'praxis.rh'],
    ['Trampo do Stem-Machine', '/c/praxis.', 'stem-machine'],
    ['Agilis', '/c/codeStage', 'Agilis'],
    ['TRAMPO DA LUMEN', '/c/codeStage', 'Lumen'],
  ])('%s => %s/%s', (title, floor, project) => {
    expect(matchTeam(title, PROJECTS)).toEqual({ floor, project });
  });

  it('nome que existe nas duas gerências é ambíguo: undefined', () => {
    expect(matchTeam('Trampo do WA-AKG', PROJECTS)).toBeUndefined();
  });

  it('nome que não casa com nenhuma pasta: undefined', () => {
    expect(matchTeam('Trampo do Notta.psi', PROJECTS)).toBeUndefined();
  });

  it('títulos genéricos ou vazios: undefined', () => {
    for (const t of ['Infra VPS', 'codestage-11', 'coding-02', '', undefined]) {
      expect(matchTeam(t, PROJECTS)).toBeUndefined();
    }
  });

  it('começo de nome com menos de 4 letras não casa: undefined', () => {
    expect(matchTeam('Trampo do Tri', PROJECTS)).toBeUndefined();
  });

  it('sem nenhuma gerência com pastas: undefined', () => {
    expect(matchTeam('Trampo do Agilis', new Map())).toBeUndefined();
  });
});

describe('teamRoomKey', () => {
  it('é a pasta do projeto dentro da gerência (mesma forma do roomKey)', () => {
    expect(teamRoomKey('/c/codeStage', 'Agilis')).toBe('/c/codeStage/Agilis');
    expect(teamRoomKey('/c/praxis.', 'praxis.rh')).toBe('/c/praxis./praxis.rh');
  });
});

describe('parseFloorProjects', () => {
  it('lê o JSON andar -> pastas', () => {
    expect(parseFloorProjects('{"/c/g":["A","B"],"/c/h":[]}')).toEqual({ '/c/g': ['A', 'B'], '/c/h': [] });
  });

  it('JSON inválido, não-objeto ou vazio: {} sem lançar', () => {
    expect(parseFloorProjects('{não é json')).toEqual({});
    expect(parseFloorProjects('[1,2]')).toEqual({});
    expect(parseFloorProjects('"x"')).toEqual({});
    expect(parseFloorProjects(undefined)).toEqual({});
    expect(parseFloorProjects('   ')).toEqual({});
  });

  it('descarta valores que não são lista de nomes', () => {
    expect(parseFloorProjects('{"/c/g":["A",3,""],"/c/h":"x"}')).toEqual({ '/c/g': ['A'] });
  });
});

describe('scanFloorProjects', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'floors-scan-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('só diretórios filhos diretos, sem ocultos, em ordem localeCompare', () => {
    const g = join(root, 'g');
    mkdirSync(join(g, 'Triluga', 'client'), { recursive: true });
    mkdirSync(join(g, 'Agilis'));
    mkdirSync(join(g, '.oculta'));
    writeFileSync(join(g, 'arquivo.txt'), 'x');
    expect(scanFloorProjects([g])).toEqual({ [g]: ['Agilis', 'Triluga'] });
  });

  it('pasta inexistente: lista vazia, sem lançar', () => {
    const missing = join(root, 'nao-existe');
    expect(scanFloorProjects([missing])).toEqual({ [missing]: [] });
  });

  it('sem andares: objeto vazio', () => {
    expect(scanFloorProjects([])).toEqual({});
  });
});

// ---------------------------------------------------------------- Office

const FLOORS = ['/c/codeStage', '/c/praxis.'];
const FLOOR_PROJECTS = {
  '/c/codeStage': ['Agilis', 'HoraH', 'Lumen', 'SelahIA', 'Triluga', 'wa-akg'],
  '/c/praxis.': ['praxis.rh', 'praxis.psi', 'stem-machine', 'wa-akg'],
};

function makeOffice(floorProjects?: Record<string, string[]>) {
  let clock = 1_000_000;
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: clock,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    now: () => clock,
    floors: FLOORS,
    ...(floorProjects ? { floorProjects } : {}),
  });
  return { office, advance: (ms: number) => (clock += ms), now: () => clock };
}

const main = (id: string, sessionId: string, cwd: string, now: number, title?: string) =>
  ({ id, account: 'acc', sessionId, cwd, role: 'Agente principal', startedAt: now, status: 'working', title }) as const;

const emptyTranscript = (title?: string) => ({ title, tasks: [], stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 } });

describe('Office: sala do projeto pelo nome da sessão', () => {
  it('(a) título casa com a pasta: a sala é a pasta do projeto no andar dela', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do Agilis'));
    const snap = office.commit().snapshot;
    expect(snap.rooms).toMatchObject([{ id: '/c/codeStage/Agilis', path: '/c/codeStage/Agilis', floor: '/c/codeStage' }]);
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Agilis');
  });

  it('(b) sessão que chega sem título e recebe o título depois muda de sala; a antiga some e o subagente acompanha', () => {
    const { office, advance, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now()));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage');
    office.addSub({ id: 's1:sub', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    expect(office.get('s1:sub')!.roomId).toBe('/c/codeStage');
    const nameBefore = office.get('acc:1')!.name;
    office.commit();

    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    const snap = office.commit().snapshot;

    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Agilis');
    expect(office.get('acc:1')!.name).toBe(nameBefore);
    expect(office.get('s1:sub')!.roomId).toBe('/c/codeStage/Agilis');
    // A sala antiga ainda tem o subagente e o agente saiu dela: ela some do snapshot quando esvazia.
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Agilis']);
    expect(office.roomPath('/c/codeStage')).toBeUndefined();
    expect(office.agentCwd('acc:1')).toBe('/c/codeStage');
    advance(OFFLINE_GRACE_MS + 1);
  });

  it('(b2) mover não recria o agente: o mesmo id, sessão e personagem', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Sessão sem nome útil'));
    const before = office.get('acc:1')!;
    const { name, look, seed } = before;
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Lumen'));
    const after = office.get('acc:1')!;
    expect(after).toMatchObject({ id: 'acc:1', sessionId: 's1', name, look, seed, roomId: '/c/codeStage/Lumen' });
  });

  it('(c) sessão com nome genérico fica na sala do cwd', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage/Triluga/client', now(), 'Infra VPS'));
    office.addMain(main('acc:2', 's2', '/c/codeStage/Agilis', now(), 'codestage-11'));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Triluga');
    expect(office.get('acc:2')!.roomId).toBe('/c/codeStage/Agilis');
  });

  it('(d) três sessões "Trampo do Triluga" ficam na MESMA sala', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do Triluga'));
    office.addMain(main('acc:2', 's2', '/x/outra', now(), 'Trampo do Triluga'));
    office.addMain(main('acc:3', 's3', '/c/codeStage/Triluga/app', now(), 'Trampo do Triluga'));
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Triluga']);
    expect(new Set(['acc:1', 'acc:2', 'acc:3'].map((id) => office.get(id)!.roomId))).toEqual(new Set(['/c/codeStage/Triluga']));
  });

  it('(e) snapshot.floors lista só andares com sala viva', () => {
    const { office, advance, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do Agilis'));
    office.addMain(main('acc:2', 's2', '/c/praxis.', now(), 'Trampo do Stem-Machine'));
    expect(office.commit().snapshot.floors).toEqual([
      { id: '/c/codeStage', name: 'codeStage' },
      { id: '/c/praxis.', name: 'praxis.' },
    ]);
    office.closeMain('acc:2');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    expect(office.commit().snapshot.floors).toEqual([{ id: '/c/codeStage', name: 'codeStage' }]);
  });

  it('título ambíguo não move: fica na sala do cwd', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do WA-AKG'));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage');
  });

  it('(f) sem floorProjects: sala é a do cwd, igual a antes, mesmo com título', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/c/codeStage/Triluga/client', now(), 'Trampo do Agilis'));
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Lumen'));
    const snap = office.commit().snapshot;
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Triluga']);
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Triluga');
  });

  it('floorProjects vazio é o mesmo que ausente', () => {
    const { office, now } = makeOffice({});
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do Agilis'));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage');
  });
});

describe('loadConfig: floorProjects', () => {
  it('HABBLAUD_FLOOR_PROJECTS vence o disco', () => {
    const cfg = loadConfig({ HABBLAUD_FLOORS: '/c/g', HABBLAUD_FLOOR_PROJECTS: '{"/c/g":["X"]}', HOME: '/tmp' }, []);
    expect(cfg.floorProjects).toEqual({ '/c/g': ['X'] });
  });

  it('sem a variável, lê as pastas do disco', () => {
    const root = mkdtempSync(join(tmpdir(), 'floors-cfg-'));
    try {
      mkdirSync(join(root, 'Beta'));
      mkdirSync(join(root, 'Alpha'));
      const cfg = loadConfig({ HABBLAUD_FLOORS: root, HOME: '/tmp' }, []);
      expect(cfg.floorProjects).toEqual({ [root]: ['Alpha', 'Beta'] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
