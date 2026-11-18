import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { loadConfig, parseFloorProjects, scanFloorProjects } from '../config';
import { NameStore } from './names';
import { Office, OFFLINE_GRACE_MS } from './office';
import { applyChanges, compactSnapshot, diffFrames } from '../../shared/timeline';
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

  it('começo de nome com 4 letras ou mais e um só candidato casa', () => {
    expect(matchTeam('Trampo do Hora', PROJECTS)).toEqual({ floor: '/c/codeStage', project: 'HoraH' });
    expect(matchTeam('Selah', PROJECTS)).toEqual({ floor: '/c/codeStage', project: 'SelahIA' });
  });

  it('começo de nome com mais de um candidato é ambíguo: undefined', () => {
    // "praxis" é começo de praxis.rh e praxis.psi (e fica com 6 letras, então só a ambiguidade barra).
    expect(matchTeam('Trampo do praxis', PROJECTS)).toBeUndefined();
    const two = new Map<string, readonly string[]>([['/c/a', ['Lumen']], ['/c/b', ['Lumenia']]]);
    expect(matchTeam('Lume', two)).toBeUndefined();
  });

  it('igualdade exata vence o começo de nome (mesmo havendo outra pasta que começa igual)', () => {
    const p = new Map<string, readonly string[]>([['/c/a', ['Lumen', 'LumenPro']]]);
    expect(matchTeam('Trampo do Lumen', p)).toEqual({ floor: '/c/a', project: 'Lumen' });
  });

  it('o mesmo nome normalizado duas vezes na mesma gerência também é ambíguo', () => {
    const p = new Map<string, readonly string[]>([['/c/a', ['praxis.rh', 'praxisrh']]]);
    expect(matchTeam('praxis.rh', p)).toBeUndefined();
  });

  it('prefixo "Trampo do" só vale no começo e sem nome depois ele não casa nada', () => {
    expect(matchTeam('Meu Trampo do Agilis', PROJECTS)).toBeUndefined();
    expect(matchTeam('Trampo do', PROJECTS)).toBeUndefined();
    expect(matchTeam('Trampo do ', PROJECTS)).toBeUndefined();
  });

  it('pasta com ponto no fim do nome e título parecido', () => {
    const p = new Map<string, readonly string[]>([['/c/a', ['praxis.']]]);
    expect(matchTeam('Trampo do praxis', p)).toEqual({ floor: '/c/a', project: 'praxis.' });
    expect(matchTeam('praxis.', p)).toEqual({ floor: '/c/a', project: 'praxis.' });
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

  it('nomes com ponto ficam como estão (praxis.rh, praxis.)', () => {
    expect(parseFloorProjects('{"/c/praxis.":["praxis.rh","praxis."]}')).toEqual({ '/c/praxis.': ['praxis.rh', 'praxis.'] });
  });

  it('a chave do andar é normalizada (barra no fim)', () => {
    expect(parseFloorProjects('{"/c/g/":["A"]}')).toEqual({ '/c/g': ['A'] });
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

  it('link simbólico para pasta conta; para arquivo ou quebrado, não', () => {
    const g = join(root, 'g');
    mkdirSync(join(g, 'Real'), { recursive: true });
    mkdirSync(join(root, 'fora'));
    writeFileSync(join(root, 'arq.txt'), 'x');
    symlinkSync(join(root, 'fora'), join(g, 'Atalho'));
    symlinkSync(join(root, 'arq.txt'), join(g, 'ArquivoLink'));
    symlinkSync(join(root, 'nada'), join(g, 'Quebrado'));
    expect(scanFloorProjects([g])).toEqual({ [g]: ['Atalho', 'Real'] });
  });

  it('nomes com ponto (praxis.rh, praxis.) são pastas como as outras', () => {
    const g = join(root, 'g');
    mkdirSync(join(g, 'praxis.rh'), { recursive: true });
    mkdirSync(join(g, 'praxis.'));
    expect(scanFloorProjects([g])[g]).toEqual(['praxis.', 'praxis.rh']);
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

describe('Office: reavaliação da sala ao vivo (rehome)', () => {
  it('equipe -> outra equipe -> título que não casa (volta à sala do cwd); a sala vazia some a cada passo', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage/Triluga/app', now()));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Triluga');
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Agilis');
    expect(office.commit().snapshot.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Agilis']);
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Lumen'));
    expect(office.commit().snapshot.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Lumen']);
    office.applyTranscript('acc:1', emptyTranscript('Refatorando o login'));
    const snap = office.commit().snapshot;
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Triluga');
    expect(snap.rooms.map((r) => r.id)).toEqual(['/c/codeStage/Triluga']);
    expect(snap.agents.filter((a) => a.id === 'acc:1')).toHaveLength(1);
  });

  it('o andar vem do snapshot: sai o andar que ficou sem sala, entra o da sala nova', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/praxis.', now()));
    expect(office.commit().snapshot.floors).toEqual([{ id: '/c/praxis.', name: 'praxis.' }]);
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    const snap = office.commit().snapshot;
    expect(snap.floors).toEqual([{ id: '/c/codeStage', name: 'codeStage' }]);
    expect(snap.rooms).toMatchObject([{ id: '/c/codeStage/Agilis', floor: '/c/codeStage' }]);
  });

  it('a sala velha continua se ainda tem alguém (outra sessão do cwd)', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now()));
    office.addMain(main('acc:2', 's2', '/c/codeStage', now()));
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    expect(office.commit().snapshot.rooms.map((r) => r.id).sort()).toEqual(['/c/codeStage', '/c/codeStage/Agilis']);
    expect(office.get('acc:2')!.roomId).toBe('/c/codeStage');
  });

  it('neto (sub de sub) também acompanha; sub que chega depois nasce na sala nova; roomPath é a pasta real', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now()));
    office.addSub({ id: 's1:a', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    office.addSub({ id: 's1:b', parentId: 's1:a', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Lumen'));
    expect(office.get('s1:a')!.roomId).toBe('/c/codeStage/Lumen');
    expect(office.get('s1:b')!.roomId).toBe('/c/codeStage/Lumen');
    office.addSub({ id: 's1:c', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    expect(office.get('s1:c')!.roomId).toBe('/c/codeStage/Lumen');
    expect(office.roomPath('/c/codeStage/Lumen')).toBe('/c/codeStage/Lumen');
    expect(office.roomName('/c/codeStage/Lumen')).toBe('Lumen');
  });

  it('o nome do registro vale sem título do transcript; o título do transcript manda quando existe', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'Trampo do Agilis'));
    // transcript com um título que não casa: manda o do transcript, a sessão volta ao cwd
    office.applyTranscript('acc:1', emptyTranscript('Ajustes diversos'));
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage');
    // transcript sem título (ex.: /clear): volta a valer o nome do registro
    office.applyTranscript('acc:1', emptyTranscript());
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Agilis');
  });

  it('nome do registro que muda com a sessão viva reavalia a sala (setSessionName), sem recriar o agente', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now(), 'codestage-9a'));
    office.addSub({ id: 's1:a', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    const before = office.get('acc:1')!;
    const { name, seed } = before;
    expect(before.roomId).toBe('/c/codeStage');
    office.setSessionName('acc:1', 'Trampo do Agilis');
    expect(office.get('acc:1')).toMatchObject({ roomId: '/c/codeStage/Agilis', name, seed });
    expect(office.get('s1:a')!.roomId).toBe('/c/codeStage/Agilis');
    office.setSessionName('acc:1', 'Trampo do Lumen');
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage/Lumen');
    office.setSessionName('acc:1', undefined);
    expect(office.get('acc:1')!.roomId).toBe('/c/codeStage');
    expect(office.commit().snapshot.rooms.map((r) => r.id)).toEqual(['/c/codeStage']);
  });

  it('personagem salvo: quem se muda não toca no personagem da sala nova e o da antiga continua guardado', () => {
    const names = new NameStore(null);
    let clock = 1_000_000;
    const office = new Office({
      names,
      version: 't',
      startedAt: clock,
      accounts: () => [],
      sources: () => [],
      accountName: () => undefined,
      now: () => clock,
      floors: FLOORS,
      floorProjects: FLOOR_PROJECTS,
    });
    // a sala de Agilis já tem personagem de OUTRA sessão (dona s9)
    names.setCharacter('/c/codeStage/Agilis', { name: 'Ana', look: 'f', seed: 7, owner: 's9' });
    // s1 tem personagem na sala do andar
    office.addMain(main('acc:1', 's1', '/c/codeStage', clock));
    expect(office.setCharacter('acc:1', { name: 'Zé', seed: 3, parts: {} }).result).toBe('ok');
    expect(office.get('acc:1')!.custom).toBe(true);

    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    const moved = office.get('acc:1')!;
    expect(moved).toMatchObject({ roomId: '/c/codeStage/Agilis', name: 'Zé' });
    // continua com o nome, mas já não é "o personagem da sala": "voltar ao sorteio" não mexe no da sala nova
    expect(moved.custom).toBeUndefined();
    expect(office.resetCharacter('acc:1')).toBe('ok');
    expect(names.character('/c/codeStage/Agilis')).toMatchObject({ name: 'Ana', owner: 's9' });
    // o personagem da sala antiga segue guardado (dono s1)
    expect(names.character('/c/codeStage')).toMatchObject({ name: 'Zé', owner: 's1' });
  });

  it('quem chega na sala da equipe pega o personagem salvo dela (a sessão que se mudou não o rouba)', () => {
    const names = new NameStore(null);
    const clock = 1_000_000;
    const office = new Office({
      names, version: 't', startedAt: clock, accounts: () => [], sources: () => [], accountName: () => undefined,
      now: () => clock, floors: FLOORS, floorProjects: FLOOR_PROJECTS,
    });
    names.setCharacter('/c/codeStage/Agilis', { name: 'Ana', look: 'f', seed: 7, owner: 's9' });
    office.addMain(main('acc:1', 's1', '/c/codeStage', clock));
    const own = office.get('acc:1')!.name;
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    expect(office.get('acc:1')!.name).toBe(own);
    // a dona volta: recebe o personagem da sala
    office.addMain(main('acc:2', 's9', '/c/codeStage/Agilis', clock));
    expect(office.get('acc:2')!.name).toBe('Ana');
  });

  it('timeline: o quadro antes e depois da mudança de sala se reconstrói pelo diff (sala velha sai, agente troca de sala)', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now()));
    const prev = compactSnapshot(office.commit().snapshot);
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    const next = compactSnapshot(office.commit().snapshot);
    const d = diffFrames(prev, next);
    expect(d).not.toBeNull();
    applyChanges(prev, d!);
    expect([...prev.rooms.keys()]).toEqual(['/c/codeStage/Agilis']);
    expect(prev.agents.get('acc:1')!.roomId).toBe('/c/codeStage/Agilis');
  });

  it('efeito (festa/alarme) fica na sala onde o evento ocorreu; depois da mudança, o evento novo vale na sala nova', () => {
    const { office, now } = makeOffice(FLOOR_PROJECTS);
    office.addMain(main('acc:1', 's1', '/c/codeStage', now()));
    office.addMain(main('acc:2', 's2', '/c/codeStage', now()));
    office.githubEvent('acc:1', { kind: 'pr_merged', number: 1 }, { key: 'k1', at: now() });
    expect(office.commit().snapshot.rooms.find((r) => r.id === '/c/codeStage')?.effect?.kind).toBe('party');
    office.applyTranscript('acc:1', emptyTranscript('Trampo do Agilis'));
    const snap = office.commit().snapshot;
    // a sala antiga continua (acc:2) com a festa dela; a nova começa limpa
    expect(snap.rooms.find((r) => r.id === '/c/codeStage')?.effect?.kind).toBe('party');
    expect(snap.rooms.find((r) => r.id === '/c/codeStage/Agilis')?.effect).toBeUndefined();
    office.githubEvent('acc:1', { kind: 'ci_failed', number: 2 }, { key: 'k2', at: now() });
    expect(office.commit().snapshot.rooms.find((r) => r.id === '/c/codeStage/Agilis')?.effect?.kind).toBe('alarm');
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
