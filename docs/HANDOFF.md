# Handoff do Habblaud

Este arquivo permite que outra pessoa ou outra IA continue o trabalho sem depender da conversa em que ele foi feito. Última atualização: 2026-11-16, na branch `feature/andares-por-gerencia`.

## 1. Projeto

O Habblaud é um escritório virtual em pixel art que mostra, em tempo real, o que os agentes do Claude Code e do Codex estão fazendo. Cada projeto vira uma sala e cada agente vira um personagem. O servidor é Node sem dependências de runtime (`server/`), a página roda no navegador (`client/`) e o código comum fica em `shared/`. O Habblaud World é uma cidade online onde cada escritório vira um prédio; a conexão com ele é opcional e só sobe dados verdadeiros e anônimos.

O dono usa o Habblaud para acompanhar os próprios agentes em várias pastas ao mesmo tempo. O princípio que mais pesa: **nada do trabalho do dono sai do computador**, e o que sobe para o World precisa refletir o escritório real. Veja o aviso no `CLAUDE.md` da raiz.

## 2. Repositório

- Caminho local: `/home/caminhao/habblaud`.
- Remoto: `origin` = `https://github.com/marmottajr/habblaud.git`. Branch principal: `main`.
- Commits: mensagem em português, corpo curto explicando o porquê, e a linha `Co-Authored-By` ao final. Caminhos explícitos no `git add`; nunca `git add -A`, nunca amend nem reset de commit já feito.
- Último release na `main`: v1.0.3.

**Branch de trabalho**

- Branch atual: `feature/andares-por-gerencia`.
- Tipo: feature. Base: `main` (commit `faa1a01`).
- No remoto: ainda não (nenhum push feito).
- Merge: aguardando a conferência final e a aprovação do dono. Não fazer merge, tag nem push da `main` sem ela.
- Estado do git: árvore limpa, exceto `CLAUDE.md`, modificado pelo `graphify claude install` (+10 linhas). Essa modificação não deve entrar em commit da feature sem o dono pedir.
- Commits da feature (do mais antigo): spec e plano (`40b974c`, `a11e078`), funções de andar (`87a29c3`, `876a005`), escritório publica andar (`c453847`, `c45d94b`), teste do World (`e92b24e`), lógica do cliente (`37622e5`, `aeb5136`), `floorTabs` para a UI (`b7c9678`), mundo mostra um andar (`2bfa7ef`, `c1d19da`), seletor e lista lateral (`a72ebcc`, `4b6be42`), documentação (ver `git log`).

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
- Números verdes mais recentes (Node 24, em 2026-11-16): `npx vitest run client shared server/model` = 1111 testes passando; `i18n:check` = 2987/2987 em en, es e fr; typecheck e build verdes. **Falha conhecida e anterior à feature**: `server/world/uplink.test.ts`, caso "o tema e as opções do jogador" (espera `tema`); falha também no commit pai. Não foi investigada.
- Armadilha: o container já caiu uma vez sem erro nos logs (código 127). Basta `docker start habblaud`; a política é `unless-stopped`.

## 5. Planos

- Spec: `docs/superpowers/specs/2026-11-16-andares-por-gerencia-design.md`.
- Plano: `docs/superpowers/plans/2026-11-16-andares-por-gerencia.md` (8 tarefas; as 1 a 6 estão feitas e revisadas, a 7 é esta documentação, a 8 é a conferência final).
- Decisões do dono (2026-11-16): a gerência vira **um andar por gerência**; navegação **um andar por vez com seletor**; as gerências vêm de uma **lista configurada** (`HABBLAUD_FLOORS`); dentro do andar, **cada pasta filha direta da gerência é uma sala** (`coding/codeStage/Triluga` é a sala `Triluga`; sessão em subpasta cai nela).
- Para a máquina do dono: `HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.`. `vigia` e a própria pasta `coding` ficam no térreo.

## 6. Onde parou

- Código da feature completo e revisado por subagentes; falta a **conferência final (Tarefa 8)**: ler o diff inteiro, rodar tudo uma vez, subir o Habblaud de verdade com `HABBLAUD_FLOORS` e olhar no navegador.
- O container em execução ainda é o da versão 1.0.3, sem a feature. Subir a feature reinicia o container; avisar o dono antes.
- Backend: `server/model/floors.ts` (`parseFloors`, `floorOf`, `roomKey`, `floorInfos`, `FloorSlots`), `Office` publica `RoomInfo.floor` e `OfficeSnapshot.floors`, vagas por andar, o timelapse guarda o andar.
- Cliente: `client/src/world/floor.ts` (lógica pura), `createWorld` com `floor()`, `setFloor()`, `onFloor()`, `client/src/ui/floors.ts` (seletor, fixo sob a barra do topo, escondido na cidade), `client/src/ui/floor-tabs.ts` (contagens), lista lateral ordenada por andar com etiqueta.
- **Não verificado** (só o navegador confirma): pintura real e enquadramento da câmera ao trocar de andar; seletor em janela estreita e com a linha de uso aberta; arrastar sala entre andares (deve recusar); troca de andar ao clicar em agente de outro andar; timelapse com andares; moedinhas de agentes de andar escondido; o que acontece com sessões Codex em `/home/caminhao/codeStage` (pasta antiga, de root, fora de `coding`).

## 7. O que falta

1. Tarefa 8: conferência final e integração real (acima).
2. Perguntar ao dono, em frases completas, se aprova o merge na `main`.
3. Depois do "aprovo": `git merge --no-ff`, testes na `main`, bump de versão (minor: funcionalidade nova, sugerido 1.1.0), tag anotada, push da `main` e da tag. Deploy só com pedido explícito.

## 8. Desafios e riscos

- Ligar `HABBLAUD_FLOORS` muda o id e o caminho das salas dentro das gerências: apelidos de sala salvos em `rooms.json` deixam de valer e o timelapse do dia mistura ids antigos e novos. Está no `CHANGELOG`.
- No timelapse os andares saem em ordem alfabética (o quadro não guarda a ordem da configuração). E se o andar escolhido não existir num instante do replay, a vista cai no primeiro andar e não volta sozinha. Corrigir exigiria guardar um "andar desejado" separado do mostrado.
- `client/src/world/sim/sim.ts` tem quase 2000 linhas; a feature não o altera de propósito (filtra o snapshot antes dele).
- `client/src/world/` nunca pode importar de `client/src/ui/` (o teste `visit.test.ts` de isolamento da Visita barra isso).
- A projeção para o World (`shared/world/projection.ts`) recebe só ids de sala. `server/model/floors-world.test.ts` fixa que andar e nome de gerência nunca entram no pacote. Qualquer mudança em `shared/world/` ou `server/world/` exige ler `shared/world/README.md` e `docs/world/privacidade.md` antes.
- O "Assumir aqui" (retomar sessão pelo terminal) usa o `cwd` cru do agente (`Office.agentCwd`), não o caminho da sala, porque a sala agora pode ser a pasta-mãe.

## 9. Decisões abertas do dono

- Aprovar ou não o merge da feature na `main` (e a versão, sugerida 1.1.0).
- Se a pasta antiga `/home/caminhao/codeStage` deve entrar na lista de gerências.
- Se o limite do timelapse acima merece correção antes do merge.
- Se o `CLAUDE.md` com a seção do graphify deve ser commitado no repositório (é público, MIT).

## 10. Regras do dono e convenções

- Feature em branch `feature/<nome>`, correção em `fix/<nome>`; nunca commit direto na `main`; merge só com aprovação do dono.
- Nunca push forçado; nunca segredo, `.env` ou log de subagente em commit; deploy e qualquer ação em servidor só com pedido explícito.
- Todo texto visível em `tr('PT')` com traduções; toda mudança visível em "Não lançado" do `CHANGELOG.md`.
- Subagentes: um por vez; quem desenvolve usa o modelo haiku, quem revisa e corrige usa sonnet; o agente principal confere por amostra (diff, testes, integração real) antes de dar como pronto.
- Comunicação com o dono: respostas curtas, uma coisa por vez, recomendação clara com o porquê, e no fim a lista do que falta, a recomendação e o próximo passo.

## 11. Onde estão os detalhes

- Spec e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.
- Contrato entre backend e frontend durante a feature: `.superpowers/sdd/andares/contrato.md` (local, fora do git).
- Grafo de código: `graphify-out/` (local, fora do git). Consultar com `graphify query "..."`; atualizar com `graphify update .` depois de mudar código.
- Regras de contribuição: `CONTRIBUTING.md`. Dados do World: `shared/world/README.md` e `docs/world/privacidade.md`.
