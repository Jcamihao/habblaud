# Handoff do Habblaud

Este arquivo permite que outra pessoa ou outra IA continue o trabalho sem depender da conversa em que ele foi feito. Última atualização: 2026-11-18, depois do merge da feature dos andares na `develop`.

## 1. Projeto

O Habblaud é um escritório virtual em pixel art que mostra, em tempo real, o que os agentes do Claude Code e do Codex estão fazendo. Cada projeto vira uma sala e cada agente vira um personagem. O servidor é Node sem dependências de runtime (`server/`), a página roda no navegador (`client/`) e o código comum fica em `shared/`. O Habblaud World é uma cidade online onde cada escritório vira um prédio; a conexão com ele é opcional e só sobe dados verdadeiros e anônimos.

O dono usa o Habblaud para acompanhar os próprios agentes em várias pastas ao mesmo tempo. O princípio que mais pesa: **nada do trabalho do dono sai do computador**, e o que sobe para o World precisa refletir o escritório real. Veja o aviso no `CLAUDE.md` da raiz.

## 2. Repositório

- Caminho local: `/home/caminhao/habblaud`.
- Remoto: `origin` = `https://github.com/marmottajr/habblaud.git`. Branch de produção: `main` (pública, tags de release). Branch de integração: `develop`, criada a partir da `main` em 2026-11-18 por decisão do dono (fluxo `feat/fix` -> `develop` -> `main`; o merge da `develop` na `main` só quando o dono pedir).
- Commits: mensagem em português, corpo curto explicando o porquê, e a linha `Co-Authored-By` ao final. Caminhos explícitos no `git add`; nunca `git add -A`, nunca amend nem reset de commit já feito.
- Último release na `main`: v1.0.3.

**Branch de trabalho**

- Branch atual: `develop` (a feature `feature/andares-por-gerencia`, base `main` no commit `faa1a01`, foi mergeada nela com `--no-ff`; a branch da feature foi apagada). Próximas tarefas: abrir `feat/<nome>` ou `fix/<nome>` a partir da `develop`.
- No remoto: a `develop` foi enviada; a `main` não mudou (continua na v1.0.3, sem a feature).
- Merge na `main`: **aguardando pedido explícito do dono**. Ao pedir: `git merge --no-ff` da `develop`, testes, bump de versão (minor, sugerido 1.1.0), tag anotada `vX.Y.Z`, push da `main` e da tag. Deploy só com pedido explícito.
- Estado do git: árvore limpa, exceto `CLAUDE.md`, modificado pelo `graphify claude install` (+10 linhas). Essa modificação não deve entrar em commit sem o dono pedir.
- Commits da feature (do mais antigo): spec e plano (`40b974c`, `a11e078`), funções de andar (`87a29c3`, `876a005`), escritório publica andar (`c453847`, `c45d94b`), teste do World (`e92b24e`), lógica do cliente (`37622e5`, `aeb5136`), `floorTabs` para a UI (`b7c9678`), mundo mostra um andar (`2bfa7ef`, `c1d19da`), seletor e lista lateral (`a72ebcc`, `4b6be42`), documentação e handoff (`6c37735`, `684a651`), correção visual do seletor (`6cb1d85`).

## 3. Stack

- TypeScript, Node 22.12 ou mais recente (o Docker usa Node 24), Vite no cliente, Vitest.
- Zero dependências de runtime. Interface em português, inglês, espanhol e francês (`tr('texto em PT')`, traduções em `shared/locales/`).
- Serviço externo opcional: Habblaud World (`https://server.habblaud.com`, desligado por `HABBLAUD_WORLD=0`).
- Roda em Docker no computador do dono (container `habblaud`, porta `4747` só local), lendo em modo somente leitura os transcripts de `~/.claude` e `~/.codex`.

## 4. Como rodar

- Variáveis (só nomes): `HABBLAUD_FLOORS` (nova), `HABBLAUD_CODEX`, `HABBLAUD_DATA_DIR`, `HABBLAUD_PORT`, `HABBLAUD_DEMO`, `HABBLAUD_WORLD`, `COMPOSE_FILE`. O `.env` do projeto fica fora do git.
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
- Para a máquina do dono: `HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.`. `vigia` e a própria pasta `coding` ficam no térreo.

## 6. Onde parou

- Feature completa, revisada por subagentes e conferida pelo agente principal (testes, build, integração real). Mergeada na `develop`; a `main` ainda não a tem.
- O container do dono foi reconstruído em 2026-11-18 a partir da feature, com `HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.` no `.env`. Hoje o servidor só vê sessões em `/home/caminhao/codeStage` (pasta antiga, de root) e `/home/caminhao/coding`, então nenhum andar aparece até o dono abrir sessões dentro de `coding/codeStage/<projeto>` ou `coding/praxis./<projeto>`.
- Verificado no navegador (Chromium headless, instância de teste com 6 sessões fictícias): o seletor aparece, as contagens batem, cada clique troca de andar e ativa o botão, a sala de subpasta cai na sala da pasta filha, nenhum erro no console, layout largo (1280px) e estreito (560px). Duas falhas visuais achadas aí foram corrigidas em `6cb1d85` (o seletor cobria o rótulo da cozinha; a contagem do andar ativo sumia).
- Backend: `server/model/floors.ts` (`parseFloors`, `floorOf`, `roomKey`, `floorInfos`, `FloorSlots`), `Office` publica `RoomInfo.floor` e `OfficeSnapshot.floors`, vagas por andar, o timelapse guarda o andar.
- Cliente: `client/src/world/floor.ts` (lógica pura), `createWorld` com `floor()`, `setFloor()`, `onFloor()`, `client/src/ui/floors.ts` (seletor, fixo sob a barra do topo, escondido na cidade), `client/src/ui/floor-tabs.ts` (contagens), lista lateral ordenada por andar com etiqueta.
- **Não verificado**: arrastar sala entre andares (o código deve recusar; não foi testado no navegador); clicar em agente de outro andar na lista lateral (troca de andar e foco); timelapse com andares; seletor com a linha de uso da conta aberta (a barra do topo cresce); moedinhas de agentes de andar escondido; sessões Codex em `/home/caminhao/codeStage`; o seletor com o Habblaud em PT (as capturas saíram em inglês, pelo idioma do navegador de teste).

## 7. O que falta

1. O dono abrir sessões dentro das pastas das gerências e conferir os andares com os agentes reais.
2. Quando o dono pedir: merge da `develop` na `main`, versão 1.1.0 e tag (passos na seção 2).
3. Itens da seção 9 que o dono ainda decide.

## 8. Desafios e riscos

- Ligar `HABBLAUD_FLOORS` muda o id e o caminho das salas dentro das gerências: apelidos de sala salvos em `rooms.json` deixam de valer e o timelapse do dia mistura ids antigos e novos. Está no `CHANGELOG`.
- No timelapse os andares saem em ordem alfabética (o quadro não guarda a ordem da configuração). E se o andar escolhido não existir num instante do replay, a vista cai no primeiro andar e não volta sozinha. Corrigir exigiria guardar um "andar desejado" separado do mostrado.
- `client/src/world/sim/sim.ts` tem quase 2000 linhas; a feature não o altera de propósito (filtra o snapshot antes dele).
- `client/src/world/` nunca pode importar de `client/src/ui/` (o teste `visit.test.ts` de isolamento da Visita barra isso).
- A projeção para o World (`shared/world/projection.ts`) recebe só ids de sala. `server/model/floors-world.test.ts` fixa que andar e nome de gerência nunca entram no pacote. Qualquer mudança em `shared/world/` ou `server/world/` exige ler `shared/world/README.md` e `docs/world/privacidade.md` antes.
- O "Assumir aqui" (retomar sessão pelo terminal) usa o `cwd` cru do agente (`Office.agentCwd`), não o caminho da sala, porque a sala agora pode ser a pasta-mãe.

## 9. Decisões abertas do dono

- Quando levar a `develop` para a `main` (e a versão, sugerida 1.1.0).
- Se a pasta antiga `/home/caminhao/codeStage` deve entrar na lista de gerências.
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
