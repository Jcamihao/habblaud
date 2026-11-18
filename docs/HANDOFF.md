# Handoff do Habblaud

Este arquivo permite que outra pessoa ou outra IA continue o trabalho sem depender da conversa em que ele foi feito. Última atualização: 2026-11-18, depois do merge das equipes por nome de sessão na `develop`.

## 1. Projeto

O Habblaud é um escritório virtual em pixel art que mostra, em tempo real, o que os agentes do Claude Code e do Codex estão fazendo. Cada projeto vira uma sala e cada agente vira um personagem. O servidor é Node sem dependências de runtime (`server/`), a página roda no navegador (`client/`) e o código comum fica em `shared/`. O Habblaud World é uma cidade online onde cada escritório vira um prédio; a conexão com ele é opcional e só sobe dados verdadeiros e anônimos.

O dono usa o Habblaud para acompanhar os próprios agentes em várias pastas ao mesmo tempo. O princípio que mais pesa: **nada do trabalho do dono sai do computador**, e o que sobe para o World precisa refletir o escritório real. Veja o aviso no `CLAUDE.md` da raiz.

## 2. Repositório

- Caminho local: `/home/caminhao/habblaud`.
- Remotos: `origin` = fork do dono (`git@github.com:Jcamihao/habblaud.git`); `upstream` = `https://github.com/marmottajr/habblaud.git` (original, só leitura). Branch de produção: `main` (pública, tags de release). Branch de integração: `develop`, criada a partir da `main` em 2026-11-18 por decisão do dono (fluxo `feat/fix` -> `develop` -> `main`; o merge da `develop` na `main` só quando o dono pedir).
- Commits: mensagem em português, corpo curto explicando o porquê, e a linha `Co-Authored-By` ao final. Caminhos explícitos no `git add`; nunca `git add -A`, nunca amend nem reset de commit já feito.
- Último release na `main`: v1.0.3.

**Branch de trabalho**

- Branch atual: `develop`. As duas features (andares por pasta, `feature/andares-por-gerencia`; equipes por nome de sessão, `feat/equipes-por-nome`) foram mergeadas nela com `--no-ff` e as branches foram apagadas. Próximas tarefas: abrir `feat/<nome>` ou `fix/<nome>` a partir da `develop`.
- No remoto: a `develop` foi enviada ao **fork do dono** (`origin` = `git@github.com:Jcamihao/habblaud.git`, criado em 2026-11-18). O `upstream` é o repositório original `marmottajr/habblaud`, onde a conta do dono só tem leitura; a `main` local rastreia `upstream/main` (v1.0.3, sem a feature). O CI do repositório roda só em push na `main` e em pull request, sem deploy.
- Merge na `main`: **aguardando pedido explícito do dono**. Ao pedir: `git merge --no-ff` da `develop`, testes, bump de versão (minor, sugerido 1.1.0), tag anotada `vX.Y.Z`, push da `main` e da tag. Deploy só com pedido explícito.
- Estado do git: árvore limpa, exceto `CLAUDE.md`, modificado pelo `graphify claude install` (+10 linhas). Essa modificação não deve entrar em commit sem o dono pedir.
- Commits da feature (do mais antigo): spec e plano (`40b974c`, `a11e078`), funções de andar (`87a29c3`, `876a005`), escritório publica andar (`c453847`, `c45d94b`), teste do World (`e92b24e`), lógica do cliente (`37622e5`, `aeb5136`), `floorTabs` para a UI (`b7c9678`), mundo mostra um andar (`2bfa7ef`, `c1d19da`), seletor e lista lateral (`a72ebcc`, `4b6be42`), documentação e handoff (`6c37735`, `684a651`), correção visual do seletor (`6cb1d85`).

## 3. Stack

- TypeScript, Node 22.12 ou mais recente (o Docker usa Node 24), Vite no cliente, Vitest.
- Zero dependências de runtime. Interface em português, inglês, espanhol e francês (`tr('texto em PT')`, traduções em `shared/locales/`).
- Serviço externo opcional: Habblaud World (`https://server.habblaud.com`, desligado por `HABBLAUD_WORLD=0`).
- Roda em Docker no computador do dono (container `habblaud`, porta `4747` só local), lendo em modo somente leitura os transcripts de `~/.claude` e `~/.codex`.

## 4. Como rodar

- Variáveis (só nomes): `HABBLAUD_FLOORS` (nova), `HABBLAUD_FLOOR_PROJECTS` (gerada pelo `docker:up`, JSON andar -> pastas filhas; não editar), `HABBLAUD_CODEX`, `HABBLAUD_DATA_DIR`, `HABBLAUD_PORT`, `HABBLAUD_DEMO`, `HABBLAUD_WORLD`, `COMPOSE_FILE`. O `.env` do projeto fica fora do git.
- Subir/derrubar: `npm run docker:up`, `npm run docker:down`, `npm run docker:logs`. O `docker-compose.override.yml` é gerado a cada `docker:up` e não deve ser editado.
- Desenvolvimento: `npm run dev` (servidor) e `npm run demo` (dados fictícios; capturas de tela com `?mock=1`).
- **Use Node 24 nos comandos de teste**: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`. O shell padrão da máquina é Node 20, onde `WebSocket` global não existe e quase 50 testes de `server/world` falham por isso.
- Gate: `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`. Não existe script de lint.
- Números verdes mais recentes (Node 24, em 2026-11-18): `npm test` = 1966 passando e 1 falha; `npx vitest run client shared server/model` = 1112 passando; `i18n:check` = 2987/2987 em en, es e fr; typecheck e build verdes. **Falha conhecida e anterior à feature**: `server/world/uplink.test.ts`, caso "o tema e as opções do jogador" (espera `tema`); falha também no commit pai. Não foi investigada.
- Armadilha: o container saiu com código 127, sem erro nos logs, duas vezes (a 2ª depois de a máquina ficar desligada). Basta `docker start habblaud` (ou `npm run docker:up` para reconstruir); a política é `unless-stopped`.
- Para testar andares sem mexer no Habblaud real: transcripts fictícios em uma pasta temporária (`projects/<cwd com - no lugar de / e .>/<sessão>.jsonl`), um `sessions/<pid>.json` por sessão com um `pid` vivo (ex.: `sleep 3000`), e uma segunda instância (`node dist/server/index.js`) com `HABBLAUD_PORT=4748`, `HABBLAUD_CLAUDE_DIRS`, `HABBLAUD_DATA_DIR`, `HABBLAUD_USAGE_DIR`, `HABBLAUD_FLOORS`, `HABBLAUD_WORLD=0`, `HABBLAUD_TIMELINE=0`, `HABBLAUD_CODEX=0`. Capturas com `playwright-core` e o Chromium em `~/.cache/ms-playwright`.

## 5. Planos

- Spec: `docs/superpowers/specs/2026-11-16-andares-por-gerencia-design.md`.
- Plano: `docs/superpowers/plans/2026-11-16-andares-por-gerencia.md` (8 tarefas; as 1 a 6 estão feitas e revisadas, a 7 é esta documentação, a 8 é a conferência final).
- Decisões do dono (2026-11-16): a gerência vira **um andar por gerência**; navegação **um andar por vez com seletor**; as gerências vêm de uma **lista configurada** (`HABBLAUD_FLOORS`); dentro do andar, **cada pasta filha direta da gerência é uma sala** (`coding/codeStage/Triluga` é a sala `Triluga`; sessão em subpasta cai nela).
- Segunda decisão do dono (2026-11-18): o dono abre ~50 sessões do VS Code na pasta da gerência (`~/codeStage`, `~/coding`), não na pasta do projeto, e nomeia a sessão "Trampo do Triluga". O Habblaud passa a colocar a sessão na sala do projeto **pelo nome da sessão** (aprovado em conversa; sem spec escrita, desenho limitado). Regra: o título efetivo (título do transcript, que recebe o rename do usuário; o nome do registro `sessions/<pid>.json` só entra como reserva) perde o prefixo opcional "Trampo do/da/de/dos/das"; comparação sem maiúscula, acento, espaço e pontuação (`Hora H` = `HoraH`); vale igualdade exata com uma pasta filha direta de uma gerência, ou, sem igualdade, nome com 4+ letras que seja o começo do nome de exatamente 1 pasta (`SELAH` casa com `SelahIA`). Casou em mais de uma gerência/pasta (ex.: `wa-akg` existe em `codeStage` e `praxis.`): não move. Não casou: continua a sala da pasta onde a sessão foi aberta. O título pode chegar depois: o agente muda de sala ao vivo e os subagentes vão junto.
- Para a máquina do dono: `HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.` (no `.env`). `vigia` e a própria pasta `coding` ficam no térreo.

## 6. Onde parou

- As duas features estão completas, revisadas por subagentes e conferidas pelo agente principal; mergeadas na `develop` e enviadas ao fork. A `main` (v1.0.3) ainda não as tem.
- Equipes por nome: `server/model/floors.ts` (`normalizeName`, `stripTeamPrefix`, `matchTeam`, `teamRoomKey`), `server/config.ts` (`floorProjects`, `scanFloorProjects`), `Office` (`roomFor`, `rehome`, `setSessionName`), `scripts/docker-up.ts` (`floorProjectsEnv`: lê `HABBLAUD_FLOORS` do ambiente ou do `.env` no host, lista as pastas filhas e repassa no override gerado). No Docker o servidor não enxerga as pastas do host, por isso o `docker:up` faz a leitura; **projeto novo só aparece depois de rodar `npm run docker:up` de novo**.
- O container do dono foi reconstruído em 2026-11-18 com as equipes por nome. Resultado verificado com as 51 sessões reais: andar `codeStage` com as salas HoraH (4 agentes), Lumen (6), Triluga (4), SelahIA (2) e Agilis (4); andar `praxis.` com `praxis.rh` e `stem-machine` (1 cada); no térreo ficaram as sessões que não casaram (sala `codeStage` com 22, sala `coding` com 8). Capturas de tela no Chromium headless, sem erro de console.
- Verificado no navegador (Chromium headless, instância de teste com 6 sessões fictícias): o seletor aparece, as contagens batem, cada clique troca de andar e ativa o botão, a sala de subpasta cai na sala da pasta filha, nenhum erro no console, layout largo (1280px) e estreito (560px). Duas falhas visuais achadas aí foram corrigidas em `6cb1d85` (o seletor cobria o rótulo da cozinha; a contagem do andar ativo sumia).
- Backend: `server/model/floors.ts` (`parseFloors`, `floorOf`, `roomKey`, `floorInfos`, `FloorSlots`), `Office` publica `RoomInfo.floor` e `OfficeSnapshot.floors`, vagas por andar, o timelapse guarda o andar.
- Cliente: `client/src/world/floor.ts` (lógica pura), `createWorld` com `floor()`, `setFloor()`, `onFloor()`, `client/src/ui/floors.ts` (seletor, fixo sob a barra do topo, escondido na cidade), `client/src/ui/floor-tabs.ts` (contagens), lista lateral ordenada por andar com etiqueta.
- **Não verificado**: arrastar sala entre andares (o código deve recusar; não foi testado no navegador); clicar em agente de outro andar na lista lateral (troca de andar e foco); timelapse com andares; seletor com a linha de uso da conta aberta (a barra do topo cresce); moedinhas de agentes de andar escondido; sessões Codex em `/home/caminhao/codeStage`; o seletor com o Habblaud em PT (as capturas saíram em inglês, pelo idioma do navegador de teste).

## 7. O que falta

1. O dono usar o Habblaud com as equipes por nome por alguns dias e dizer o que casa mal.
2. Quando o dono pedir: merge da `develop` na `main`, versão 1.1.0 e tag (passos na seção 2).
3. Itens da seção 9 que o dono ainda decide.

## 8. Desafios e riscos

- Ligar `HABBLAUD_FLOORS` muda o id e o caminho das salas dentro das gerências: apelidos de sala salvos em `rooms.json` deixam de valer e o timelapse do dia mistura ids antigos e novos. Está no `CHANGELOG`.
- No timelapse os andares saem em ordem alfabética (o quadro não guarda a ordem da configuração). E se o andar escolhido não existir num instante do replay, a vista cai no primeiro andar e não volta sozinha. Corrigir exigiria guardar um "andar desejado" separado do mostrado.
- `client/src/world/sim/sim.ts` tem quase 2000 linhas; a feature não o altera de propósito (filtra o snapshot antes dele).
- `client/src/world/` nunca pode importar de `client/src/ui/` (o teste `visit.test.ts` de isolamento da Visita barra isso).
- A projeção para o World (`shared/world/projection.ts`) recebe só ids de sala. `server/model/floors-world.test.ts` fixa que andar e nome de gerência nunca entram no pacote. Qualquer mudança em `shared/world/` ou `server/world/` exige ler `shared/world/README.md` e `docs/world/privacidade.md` antes.
- Equipes por nome, limites conhecidos: `Trampo do Notta.psi` não casa (a pasta `Notta.psi` só existe no `~/codeStage` antigo, fora das gerências); nomes soltos (`Infra VPS`, `Universal-modder Skill`, `Agente de Credito`, `codestage-NN`, `coding-NN`) ficam na sala do cwd; `wa-akg` é ambíguo e não move; se o último prompt de uma sessão sem nome for exatamente o nome de um projeto, ela é movida para a sala dele (o título cai para o último prompt como reserva); a festa/alarme do GitHub de uma sala some quando a sala esvazia; o aviso "chegou em" dispara na sala antiga se o título só chega depois.
- O "Assumir aqui" (retomar sessão pelo terminal) usa o `cwd` cru do agente (`Office.agentCwd`), não o caminho da sala, porque a sala agora pode ser a pasta-mãe.

## 9. Decisões abertas do dono

- Quando levar a `develop` para a `main` (e a versão, sugerida 1.1.0).
- O que fazer com as sessões abertas em `/home/caminhao/codeStage` (pasta antiga, de root) que não casam com projeto: hoje caem numa sala `codeStage` no térreo, parecida com o andar de mesmo nome. Incluir a pasta em `HABBLAUD_FLOORS` criaria um segundo andar com o mesmo nome; a alternativa seria um apelido que a una ao andar `coding/codeStage` (não existe ainda).
- Se o limite do timelapse acima merece correção antes do merge.
- Se o `CLAUDE.md` com a seção do graphify deve ser commitado no repositório (é público, MIT).

## 10. Regras do dono e convenções

- Fluxo (regra do dono de 2026-11-18): tarefa nova abre `feat/<nome>` (bug: `fix/<nome>`) a partir da `develop`; pronta e verde, merge `--no-ff` na `develop` e apaga a branch, sem pedir aprovação; nunca commit direto na `develop` nem na `main`; merge da `develop` na `main` só quando o dono pedir.
- Nunca push forçado; nunca segredo, `.env` ou log de subagente em commit; deploy e qualquer ação em servidor só com pedido explícito.
- Todo texto visível em `tr('PT')` com traduções; toda mudança visível em "Não lançado" do `CHANGELOG.md`.
- Subagentes: um por vez; quem desenvolve usa o modelo haiku, quem revisa e corrige usa sonnet; o agente principal confere por amostra (diff, testes, integração real) antes de dar como pronto.
- Comunicação com o dono: respostas curtas, uma coisa por vez, recomendação clara com o porquê, e no fim a lista do que falta, a recomendação e o próximo passo.

## 11. Onde estão os detalhes

- Spec e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- Contrato entre backend e frontend durante a feature: `.superpowers/sdd/andares/contrato.md` (local, fora do git).
- Grafo de código: `graphify-out/` (local, fora do git). Consultar com `graphify query "..."`; atualizar com `graphify update .` depois de mudar código.
- Regras de contribuição: `CONTRIBUTING.md`. Dados do World: `shared/world/README.md` e `docs/world/privacidade.md`.
