# Andares por gerência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada pasta listada em `HABBLAUD_FLOORS` vira um andar do escritório (com seletor), e cada pasta de projeto dentro dela vira uma sala nesse andar.

**Architecture:** O servidor deriva, do `cwd` de cada sessão, a chave da sala (`roomKey`) e o andar (`floorOf`), aloca vagas por andar e publica `RoomInfo.floor` e `OfficeSnapshot.floors`. O cliente guarda o andar visível em `createWorld`, filtra o snapshot por andar antes de entregá-lo à `Sim` (que não muda de lógica) e a recria ao trocar de andar com o `rebuild()` que já existe. O pacote do Habblaud World não é tocado.

**Tech Stack:** TypeScript, Node 22 sem dependências de runtime, Vite no cliente, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-andares-por-gerencia-design.md`

## Global Constraints

- Branch `feature/andares-por-gerencia`; commits só com caminhos explícitos, nunca `git add -A`, nunca amend nem reset.
- Todo texto visível: `tr('texto em PT')`, valores por lacunas (`tr('x {0}', [v])`); `npm run i18n:check` limpo, com tradução em `shared/locales/en.ts`, `es.ts` e `fr.ts`.
- Mudança visível entra em "Não lançado" do `CHANGELOG.md` (Task 7).
- Proibido editar qualquer arquivo de `shared/world/` e `server/world/` (só criar teste novo fora dessas pastas). Ler `shared/world/README.md` antes da Task 3.
- Variável: `HABBLAUD_FLOORS`, caminhos absolutos separados por vírgula; sem ela, comportamento idêntico ao atual (sem seletor, `floor` ausente).
- Andar térreo = `GROUND = ''` no cliente; no servidor, sala sem andar tem `floor` ausente.
- Campos novos só aditivos: `RoomInfo.floor?: string`, `OfficeSnapshot.floors?: FloorInfo[]`.
- Gate de cada task: `npm run typecheck` e `npx vitest run <arquivos da task>`; no fim, `npm test`, `npm run build`, `npm run i18n:check`.
- Modelos (regra do dono): dev = haiku, revisão e correção = sonnet, um subagente por vez. Tasks 1, 2 e 3 são do backend; 4, 5 e 6 do frontend. O contrato entre eles é o bloco **Produces** da Task 2 e da Task 4, copiado para `.superpowers/sdd/andares/contrato.md` antes de despachar.

## Review Focus

1. Prefixo por segmento, não por texto: cwd `/a/praxis.x` NÃO está na gerência `/a/praxis.` (Task 1).
2. Sessão em `codeStage/Triluga/client` cai na sala `codeStage/Triluga`; sessão em `codeStage` é sala própria no andar dela (Task 1 e 2).
3. O andar visível esvazia (última sessão sai): a vista volta sozinha para outro andar e a seleção não quebra (Task 4 e 5).
4. Agente "precisa de você" num andar escondido aparece no botão do andar (Task 4 e 6).
5. Vagas (`slot`) agora repetem entre andares: ordenar só por `slot` mistura salas; o timelapse (`server/history/timeline.ts`, `client/net/timeline.ts`) precisa guardar e restaurar `floor` (Task 2 e 6).
6. `HABBLAUD_FLOORS` com caminho relativo, `/`, vazio ou duplicado é descartado com aviso (Task 1).

---

### Task 1: Funções puras de andar e configuração

**Files:**
- Create: `server/model/floors.ts`, `server/model/floors.test.ts`
- Modify: `server/config.ts` (campo `floors` + chamada em `loadConfig`)

**Interfaces:**
- Produces (em `server/model/floors.ts`, todas puras):
  - `parseFloors(raw: string | undefined): { floors: string[]; warnings: string[] }` — separa por vírgula, `trim`, `normalizeCwd`; descarta vazio, não absoluto (não começa com `/`), `/` e duplicado, cada descarte gerando um aviso (texto em PT sem `tr`, pois o log chama `tr` depois: devolver só a entrada descartada em `warnings`).
  - `floorOf(cwd: string, floors: readonly string[]): string | undefined` — a pasta-gerência mais específica (a mais longa) tal que `cwd === f` ou `cwd.startsWith(f + '/')`.
  - `roomKey(cwd: string, floors: readonly string[]): string` — `normalizeCwd(cwd)` fora de gerência ou na raiz dela; dentro de uma gerência `f`, `f + '/' + <primeiro segmento abaixo de f>`.
  - `floorInfos(floors: readonly string[], alive: ReadonlySet<string>): { id: string; name: string }[]` — só os de `alive`, na ordem de `floors`, nome pelo `roomDisplayNames` de `./rooms` (desambigua repetidos).
  - `class FloorSlots { constructor(cooldownMs?: number); sync(rooms: ReadonlyMap<string, string | undefined>, now: number): boolean; slotOf(roomId: string): number | undefined }` — `rooms` mapeia id da sala -> andar (ou `undefined`); um `SlotAllocator` (de `./rooms`) por andar, para a vaga compactar dentro do andar; andar sem salas vivas sincroniza com lista vazia (libera as vagas).
- `ServerConfig.floors: string[]` e `ServerConfig.floorWarnings: string[]` (em `server/config.ts`).

- [ ] **Step 1: Escrever `server/model/floors.test.ts`** com os casos: `floorOf('/c/codeStage/Triluga/x', ['/c/codeStage','/c/praxis.'])` = `'/c/codeStage'`; `floorOf('/c/praxis.x/a', ['/c/praxis.'])` = `undefined`; `floorOf('/c/praxis./rh', ...)` = `'/c/praxis.'`; aninhadas (`/c` e `/c/g`) escolhem `/c/g`; `roomKey('/c/g/Triluga/client/src', ['/c/g'])` = `'/c/g/Triluga'`; `roomKey('/c/g', ['/c/g'])` = `'/c/g'`; `roomKey('/x/y//', [])` = `'/x/y'`; `parseFloors(' /a , a/b,/a,,/ ,/b/ ')` = `{ floors: ['/a','/b'], warnings: ['a/b','/a','','/'] }` (ajustar a ordem dos avisos ao que a implementação produz, mas os 4 descartes devem aparecer); `FloorSlots`: duas salas em andares diferentes recebem ambas a vaga 0; saída de sala libera só no andar dela e respeita o cooldown.
- [ ] **Step 2:** Rodar `npx vitest run server/model/floors.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `server/model/floors.ts` com as assinaturas acima, reutilizando `normalizeCwd`, `roomDisplayNames` e `SlotAllocator` de `server/model/rooms.ts` (sem duplicar).
- [ ] **Step 4:** Em `server/config.ts`, acrescentar `floors` e `floorWarnings` ao `ServerConfig` (com comentário no estilo dos vizinhos) e preenchê-los em `loadConfig` com `parseFloors(env.HABBLAUD_FLOORS)`. Acrescentar em `floors.test.ts` um caso `loadConfig({ HABBLAUD_FLOORS: '/a,/b', HOME: '/tmp' })` conferindo `floors` (só se `loadConfig` rodar sem efeito colateral nos testes existentes; senão cobrir só `parseFloors`).
- [ ] **Step 5:** Rodar `npm run typecheck` e `npx vitest run server/model/floors.test.ts`. Esperado: PASS.
- [ ] **Step 6: Commit** — `git add server/model/floors.ts server/model/floors.test.ts server/config.ts` e `git commit -m "Andares: funções de andar e HABBLAUD_FLOORS"` (corpo explicando o porquê e a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).

### Task 2: O escritório publica andar por sala

**Files:**
- Modify: `shared/types.ts` (`RoomInfo`, `OfficeSnapshot`, novo `FloorInfo`), `server/model/office.ts` (deps, `ensureRoom` chamador na linha ~325, `build`, `slots`), `server/index.ts` (passar `floors` ao `new Office`), `server/history/timeline.ts` (guardar e restaurar `floor`; ler o arquivo antes e seguir o formato dele), `client/src/net/timeline.ts` (restaurar `floor` dos quadros)
- Test: `server/model/floors-office.test.ts` (novo; seguir o arranjo de `server/model/model.test.ts`)

**Interfaces:**
- Consumes: `roomKey`, `floorOf`, `floorInfos`, `FloorSlots` da Task 1; `config.floors`.
- Produces:
  - `export interface FloorInfo { id: string; name: string }` em `shared/types.ts`.
  - `RoomInfo.floor?: string` (id do andar = caminho normalizado da gerência; ausente = térreo).
  - `OfficeSnapshot.floors?: FloorInfo[]` (só andares com sala viva; ausente se `config.floors` vazio).
  - `OfficeDeps.floors?: readonly string[]` no `Office`.
  - Semântica: `RoomInfo.id` e `RoomInfo.path` de uma sala dentro de gerência = `roomKey(cwd, floors)`; `slot` é por andar.

- [ ] **Step 1: Escrever `server/model/floors-office.test.ts`**: com `floors: ['/c/g']`, sessões em `/c/g/Triluga`, `/c/g/Triluga/client`, `/c/g/Agilis` e `/c/solto` produzem 3 salas (`/c/g/Triluga`, `/c/g/Agilis`, `/c/solto`); as duas primeiras com `floor === '/c/g'` e vagas 0 e 1; `/c/solto` sem `floor` e vaga 0; `snapshot.floors` = `[{ id: '/c/g', name: 'g' }]`. Sem `floors` nas deps: nenhum `floor`, nenhum `snapshot.floors`, mesma saída de antes. Quando a última sala de `/c/g` sai, `snapshot.floors` deixa de listá-lo.
- [ ] **Step 2:** Rodar `npx vitest run server/model/floors-office.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Em `shared/types.ts`, acrescentar os tipos acima com comentário em PT. Em `office.ts`: adicionar `floors?` às deps; trocar `normalizeCwd(p.cwd)` por `roomKey(p.cwd, floors)` no ponto de criação do id da sala; trocar `SlotAllocator` por `FloorSlots` (chamando `sync` com o mapa id -> `floorOf(path, floors)`); em `build()` preencher `floor` e `floors` (só quando houver `floors` configurado) e ordenar `rooms` por (índice do andar, `slot`). Sala demo continua sem andar.
- [ ] **Step 4:** Em `server/index.ts`, passar `floors: config.floors` ao `new Office({...})` e registrar `config.floorWarnings` com `log.warn(tr('HABBLAUD_FLOORS: entrada ignorada ({0}).', [entrada]))`, uma por entrada. Ler `server/history/timeline.ts` e `client/src/net/timeline.ts`: quando o quadro grava `slot`, gravar e restaurar também `floor` (compatível com quadros antigos sem o campo); acrescentar um teste ao arquivo de teste existente do timeline cobrindo o ida-e-volta.
- [ ] **Step 5:** Rodar `npm run typecheck` e `npx vitest run server/model server/history shared`. Esperado: PASS (os testes antigos não mudam).
- [ ] **Step 6: Commit** — `git add shared/types.ts server/model/office.ts server/index.ts server/history/timeline.ts client/src/net/timeline.ts server/model/floors-office.test.ts` (mais o arquivo de teste do timeline tocado) e `git commit -m "Andares: o escritório publica andar e vaga por andar"`.

### Task 3: Pacote do World não muda com andares

**Files:**
- Create: `server/model/floors-world.test.ts`

**Interfaces:**
- Consumes: `project` e o tipo de entrada de `shared/world/projection.ts` (ler a assinatura real e `shared/world/README.md` antes; **não editar** nada em `shared/world/` nem `server/world/`), `RoomInfo.floor` da Task 2.

- [ ] **Step 1:** Escrever o teste: montar dois snapshots idênticos com 3 salas e 3 agentes, um sem `floor` e outro com `floor` e `floors` preenchidos; chamar `project(...)` com o mesmo `WorldIdSource` determinístico (copiar o de `shared/world/projection.test.ts`) e o mesmo `now`; `expect(comAndares).toEqual(semAndares)` e conferir que `JSON.stringify` do pacote não contém `/c/g` nem o nome da gerência.
- [ ] **Step 2:** Rodar `npx vitest run server/model/floors-world.test.ts shared/world`. Esperado: PASS (se falhar, parar e avisar: a projeção não pode mudar).
- [ ] **Step 3: Commit** — `git add server/model/floors-world.test.ts` e `git commit -m "Andares: teste de que o pacote do World não muda"`.

### Task 4: Lógica pura de andar no cliente

**Files:**
- Create: `client/src/world/floor.ts`, `client/src/world/floor.test.ts`

**Interfaces:**
- Consumes: `OfficeSnapshot`, `RoomInfo.floor`, `FloorInfo` (Task 2); `Selection` de `client/src/world/api.ts`; `waitingAgents` de `client/src/ui/model.ts`.
- Produces (todas puras):
  - `export const GROUND = ''`.
  - `export interface FloorTab { id: string; name: string; agents: number; working: number; waiting: number }`.
  - `floorTabs(snap: OfficeSnapshot | null): FloorTab[]` — `[]` se `snap.floors` ausente ou vazio; senão, o térreo (`id: GROUND`, `name: tr('Térreo')`) primeiro, só se existir sala sem `floor`, seguido de `snap.floors` na ordem; contagens por agentes da sala do andar (`working` = status `working`, `waiting` = `waitingAgents`).
  - `visibleFloor(snap: OfficeSnapshot | null, wanted: string): string` — `wanted` se estiver em `floorTabs`; senão o id do primeiro tab; sem tabs, `GROUND`.
  - `filterSnapshotByFloor(snap: OfficeSnapshot, floorId: string): OfficeSnapshot` — devolve `snap` (mesma referência) sem `floors`; senão `rooms` com `(room.floor ?? GROUND) === floorId`, `agents` cujo `roomId` está nessas salas, `ptys` cujo `agentId` está nesses agentes; resto igual.
  - `floorOfSelection(snap: OfficeSnapshot | null, sel: Selection): string | undefined` — andar da sala ou do agente selecionado; `undefined` se não achar.

- [ ] **Step 1:** Escrever `floor.test.ts`: snapshot com térreo (`/c/solto`) e andares `g` e `h`, 2 agentes em `g` (um `waiting`), 1 em `h`: `floorTabs` devolve 3 tabs com `waiting === 1` em `g`; `filterSnapshotByFloor(snap, 'g')` mantém só as salas e os agentes de `g`; sem `floors` devolve a mesma referência; `visibleFloor(snap, 'removido')` cai no primeiro tab; sem térreo vivo, o térreo não aparece nos tabs e `visibleFloor(snap, GROUND)` cai em `g`; `floorOfSelection` acha o andar de um agente e de uma sala.
- [ ] **Step 2:** Rodar `npx vitest run client/src/world/floor.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `client/src/world/floor.ts` com as assinaturas acima.
- [ ] **Step 4:** Rodar `npm run typecheck` e `npx vitest run client/src/world/floor.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit** — `git add client/src/world/floor.ts client/src/world/floor.test.ts` e `git commit -m "Andares: lógica pura de andar no cliente"`.

### Task 5: O mundo mostra um andar por vez

**Files:**
- Modify: `client/src/world/api.ts` (`WorldApi`), `client/src/world/index.ts` (`createWorld`)

**Interfaces:**
- Consumes: `GROUND`, `visibleFloor`, `filterSnapshotByFloor`, `floorOfSelection` (Task 4); o `rebuild()` e `overview(true)` já existentes em `createWorld`.
- Produces (aditivos e opcionais em `WorldApi`, no estilo de `setViewInsets?`): `floor?(): string`, `setFloor?(id: string): void`, `onFloor?(cb: (id: string) => void): () => void`.

- [ ] **Step 1:** Em `createWorld`, acrescentar `let floor = GROUND` e `floorCbs`. Em `onSnapshot`: calcular `const f = visibleFloor(snap, floor)`; se `f !== floor`, `floor = f; rebuild();` e avisar `floorCbs`; aplicar `sim.applySnapshot(filterSnapshotByFloor(...), ...)` nos dois ramos (ao vivo e `rebaseSnapshot` do timelapse).
- [ ] **Step 2:** Implementar `setFloor(id)`: se `visibleFloor(store.snapshot, id) !== floor`, `floor = ...; rebuild(); onSnapshot(); overview(true);` e avisar `floorCbs`. Expor `floor`, `setFloor` e `onFloor` no objeto devolvido e na interface `WorldApi`.
- [ ] **Step 3:** Em `setSelection`, antes de `focusAgent`/`focusRoom`, se `floorOfSelection(store.snapshot, sel)` existir e diferir do andar atual, chamar `setFloor` nele (assim o `sim.person(id)` já existe quando a câmera foca).
- [ ] **Step 4:** Rodar `npm run typecheck`, `npx vitest run client` e `npm run build`. Esperado: PASS. `createWorld` depende de canvas e não tem teste de unidade; o comportamento é conferido na integração (Task 8).
- [ ] **Step 5: Commit** — `git add client/src/world/api.ts client/src/world/index.ts` e `git commit -m "Andares: o mundo mostra um andar por vez"`.

### Task 6: Seletor de andar e barra lateral

**Files:**
- Create: `client/src/ui/floors.ts`, `client/src/ui/floors.test.ts`
- Modify: `client/src/ui/context.ts` (`UiContext`: `floor(): string`, `setFloor(id: string): void`), `client/src/ui/index.ts` (montar `FloorBar`, implementar o contexto sobre `world.floor/setFloor/onFloor`), `client/src/ui/model.ts` (`groupRooms` ordena por andar e depois por `slot`; `RoomGroup` ganha `floorName?: string`), `client/src/ui/sidebar.ts` (etiqueta com o nome do andar), `client/src/ui/styles.css`, `shared/locales/en.ts`, `es.ts`, `fr.ts`
- Test: `client/src/ui/model.test.ts` (acrescentar caso de ordenação)

**Interfaces:**
- Consumes: `floorTabs`, `FloorTab`, `GROUND` (Task 4); `world.floor/setFloor/onFloor` (Task 5).
- Produces: `class FloorBar implements UiComponent` (`el: HTMLElement`, `update(): void`); `floorBarModel(tabs: FloorTab[], current: string): { id: string; label: string; count: string; waiting: boolean; active: boolean }[]` pura e testada.

- [ ] **Step 1:** Escrever `floors.test.ts` para `floorBarModel`: 3 tabs, andar atual `g` -> só `g` com `active`; `waiting` verdadeiro quando `tab.waiting > 0`; vazio quando `tabs` é `[]`. Escrever em `model.test.ts` o caso: salas com `slot` repetido em dois andares saem ordenadas por andar (térreo, depois a ordem de `snap.floors`) e, dentro do andar, por `slot`.
- [ ] **Step 2:** Rodar `npx vitest run client/src/ui/floors.test.ts client/src/ui/model.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `floorBarModel` e `FloorBar` (botões `<button>` com nome, contagem de agentes e um ponto `is-waiting` quando há agente esperando o dono; escondido quando não há tabs; clique chama `ctx.setFloor(id)`; `aria-pressed` no andar atual; atualizar em cada snapshot e em `onFloor`). Montar no viewport do escritório seguindo o padrão dos outros componentes em `ui/index.ts`. Estilos em `styles.css` seguindo os tokens existentes.
- [ ] **Step 4:** Em `groupRooms`, ordenar por (posição do andar, `slot`) e preencher `floorName`; em `sidebar.ts` mostrar `floorName` como etiqueta discreta na sala. Todo texto novo (`Térreo`, rótulos e `title` dos botões, aviso de leitor de tela ao trocar de andar via `ctx.announce`) em `tr()`, com traduções em en/es/fr.
- [ ] **Step 5:** Rodar `npm run typecheck`, `npm test`, `npm run i18n:check`, `npm run build`. Esperado: tudo verde.
- [ ] **Step 6: Commit** — `git add` dos arquivos acima (caminhos explícitos) e `git commit -m "Andares: seletor de andar e salas ordenadas por andar"`.

### Task 7: Compose, docs e changelog

**Files:**
- Modify: `docker-compose.yml` (variável de ambiente), `CHANGELOG.md` ("Não lançado"), `README.md`, `README.pt-BR.md`, `README.es.md`, `README.fr.md` (tabela de configuração e uma seção curta "Andares por gerência"), `docs/superpowers/plans/2026-11-16-andares-por-gerencia.md` (marcar tarefas)
- Create: `docs/HANDOFF.md`

**Interfaces:** nenhuma.

- [ ] **Step 1:** Em `docker-compose.yml`, na lista `environment`, acrescentar com comentário em PT `HABBLAUD_FLOORS: ${HABBLAUD_FLOORS:-}` seguindo o estilo das vizinhas.
- [ ] **Step 2:** Documentar `HABBLAUD_FLOORS` (formato, exemplo, regra "pasta filha direta = sala", térreo, no Docker o valor vai no `.env` com caminhos do host) nos quatro READMEs, na tabela de variáveis existente, e a entrada em "Não lançado" do `CHANGELOG.md`.
- [ ] **Step 3:** Criar `docs/HANDOFF.md` com as 11 seções obrigatórias do handoff do dono, em prosa normal em português, sem segredo, incluindo o bloco "Branch de trabalho" (`feature/andares-por-gerencia`, tipo feature, base `main`, não enviada ao remoto, "merge aguardando aprovação" quando for o caso).
- [ ] **Step 4:** Rodar `npm run i18n:check` e `npm test`. Esperado: verde.
- [ ] **Step 5: Commit** — `git add docker-compose.yml CHANGELOG.md README.md README.pt-BR.md README.es.md README.fr.md docs/HANDOFF.md docs/superpowers/plans/2026-11-16-andares-por-gerencia.md` e `git commit -m "Andares: documentação, compose e handoff"`.

### Task 8: Conferência final (agente principal, sem subagente)

- [ ] **Step 1:** Ler o diff completo da branch (`git diff main...HEAD`) e a saída dos revisores; rodar `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check` uma vez.
- [ ] **Step 2:** Integração real: pôr `HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.` no `.env` (fora do git), `npm run docker:up`, conferir em `GET /api/snapshot` as salas com `floor`, e no navegador o seletor, a troca de andar, o alerta no botão e a volta ao térreo quando um andar esvazia. Antes de subir, avisar o dono que isso reinicia o container do Habblaud.
- [ ] **Step 3:** Rodar `ponytail-review` no diff; corrigir o que for real.
- [ ] **Step 4:** Atualizar `docs/HANDOFF.md`, `git push origin feature/andares-por-gerencia` e perguntar ao dono, em frases completas: "Terminou. Você aprova o merge na `main` ou quer acrescentar algo?". Sem merge nem tag até a resposta.
