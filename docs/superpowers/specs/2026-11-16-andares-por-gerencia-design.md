# Andares por gerência

Data: 2026-11-16. Branch: `feature/andares-por-gerencia`. Status: aprovado em conversa, aguardando revisão deste spec.

## Objetivo

Hoje cada pasta onde uma sessão do Claude Code ou do Codex foi aberta vira uma sala, todas no mesmo corredor. O dono
organiza o trabalho em uma pasta raiz (`coding`) com gerências dentro dela (`codeStage`, `praxis.`), e cada subprojeto
de uma gerência é uma equipe. O escritório deve mostrar essa hierarquia: **uma gerência é um andar, e cada equipe
(subprojeto) é uma sala nesse andar**. Salas que não pertencem a nenhuma gerência (a própria `coding`, `vigia`) ficam no
térreo.

Sucesso: com sessões abertas em `coding/codeStage/<projeto>` e `coding/praxis./<projeto>`, o escritório mostra um
seletor de andar (T, codeStage, praxis.); cada andar mostra só as salas da gerência; nenhum dado novo vai ao Habblaud
World.

## Decisões do dono (2026-11-16)

1. A gerência aparece como **um andar por gerência** (não como ala no corredor, nem só agrupamento na barra lateral).
2. Navegação: **um andar por vez, com seletor**. Sem prédio em corte.
3. As gerências vêm de uma **lista configurada de pastas**, não de detecção automática nem de menu na interface.

## Fora do escopo

- Agentes andando entre andares. Cada agente entra e sai pelo elevador do andar da própria sala.
- Prédio em corte com todos os andares visíveis.
- Detecção automática de gerências e menu "mover sala para andar".
- Qualquer mudança em `shared/world/` e `server/world/`. O pacote do World não muda (ver "Habblaud World").

## Configuração

Variável de ambiente `HABBLAUD_FLOORS`: lista de caminhos absolutos separados por vírgula. Exemplo para esta máquina:

```
HABBLAUD_FLOORS=/home/caminhao/coding/codeStage,/home/caminhao/coding/praxis.
```

- Lida em `server/config.ts`, junto das outras variáveis. Sem a variável (ou vazia): nenhum andar, comportamento atual
  idêntico (tudo no térreo, sem seletor).
- Cada caminho passa por `normalizeCwd`. Entradas vazias e duplicadas são descartadas.
- No Docker, os caminhos são os do host, porque os `cwd` das sessões vêm assim dos transcripts. O `docker-compose.yml`
  repassa `HABBLAUD_FLOORS: ${HABBLAUD_FLOORS:-}` e o valor fica no `.env` (fora do git), como as outras variáveis. Não
  usar o `docker-compose.override.yml`, que é gerado e recriado. Documentar no README.
- O nome do andar é o basename da pasta (`codeStage`, `praxis.`), desambiguado como as salas se houver repetição.

## Sala = pasta de projeto dentro da gerência (decisão do dono, 2026-11-16)

Dentro de um andar, **cada pasta filha direta da gerência é uma sala**: `coding/codeStage/Triluga` é a sala `Triluga`.
Sessão aberta mais fundo (`coding/codeStage/Triluga/client`) cai na mesma sala `Triluga`, não vira sala nova. Sessão
aberta na própria pasta da gerência (`coding/codeStage`) é uma sala própria no andar, com o nome da gerência. Fora de
gerência nada muda: a sala continua sendo o `cwd` exato.

- Ponto único: `server/model/office.ts` (`const roomId = normalizeCwd(p.cwd)`, hoje na linha 325) passa a usar
  `roomKey(cwd, floors)` de `server/model/floors.ts`.
- O `path` da sala é a pasta do projeto (o id), então "Nova sessão" abre na pasta do projeto, não na subpasta.

## Modelo (servidor e `shared/`)

- Nova função pura em `server/model/floors.ts`: `floorOf(cwd, floors)`. Devolve a pasta-gerência mais específica que
  contém o `cwd` (prefixo por segmento de caminho, nunca por texto: `/a/praxis.` não contém `/a/praxis.x`), ou `undefined`
  para o térreo. O `cwd` igual à própria pasta-gerência (sessão aberta na raiz da gerência) fica no andar dela.
- `RoomInfo` (`shared/types.ts`) ganha `floor?: string`: id do andar (o caminho normalizado da pasta-gerência).
  Ausente = térreo. `OfficeSnapshot` ganha `floors: FloorInfo[]` com `{ id, name }`, ordenado como na configuração,
  incluindo só andares que têm ao menos uma sala viva.
- `SlotAllocator` passa a ser um por andar (mapa andar -> alocador), para a vaga das salas compactar dentro do próprio
  andar. Sala que muda de andar (config alterada com o servidor ligado não é suportado; vale após reiniciar) não exige
  tratamento extra.
- A chave de agrupamento continua o `cwd` normalizado; o andar é derivado, não persistido. Nada novo em disco.

## Escritório (cliente)

- O cliente guarda o andar visível (`T` ou o id de um andar). Padrão: térreo. O escolhido persiste só na sessão do
  navegador.
- Cada andar é uma cópia do prédio atual (recepção com elevador, cozinha, banheiros, lounge, corredor e salas-equipe),
  construída só com as salas daquele andar. A simulação (`client/src/world/sim/sim.ts`) não muda de lógica: recebe o
  `OfficeSnapshot` filtrado pelo andar visível.
- Seletor de andar: botões `T`, `codeStage`, `praxis.` na barra do escritório. Cada botão mostra contagem de agentes
  trabalhando e um sinal quando há agente que precisa do dono (pedido de permissão ou pergunta) naquele andar, para o
  alerta não se perder num andar escondido.
- Ao trocar de andar, a simulação do andar anterior é descartada e a do novo é reconstruída a partir do snapshot. Quem
  estava andando reaparece na posição de repouso da atividade atual. Isso é aceito; manter uma `Sim` por andar fica como
  melhoria futura se incomodar.
- Se o andar visível deixa de ter salas, a vista volta ao térreo.
- Selecionar agente ou sala em outro andar (lista lateral, aviso, "Mostrar no escritório", Entregas) troca para o andar
  dele antes de focar. Passa pelo mesmo caminho do `ctx.select`.

## Barra lateral e contadores

- A lista de salas é ordenada por andar (térreo primeiro, depois a ordem da configuração) e cada sala mostra o nome do
  andar como etiqueta. Cabeçalhos de grupo ficam fora: a lista usa `KeyedList` por sala e um cabeçalho não encaixa nela
  sem reescrever a lista.
- Contadores do topo, uso das contas e feed somam o prédio inteiro, sem filtrar por andar.
- Textos novos usam `tr('...')`; traduções em `shared/locales/` e `npm run i18n:check` limpo.

## Habblaud World

O World recebe um andar fictício por sala aberta, montado só em `shared/world/projection.ts`, que recebe das salas
apenas o id. Esta mudança não toca `shared/world/` nem `server/world/`, não adiciona campo ao pacote e não envia
caminho, nome de pasta ou de gerência. Um teste fixa isso: a projeção de um snapshot com andares é idêntica à de um
snapshot sem andares. Os andares locais não são andares do World e não podem ser confundidos com eles no código nem
na documentação.

## Erros e casos de borda

- `HABBLAUD_FLOORS` com caminho relativo: ignorar a entrada e registrar aviso em log (`tr`).
- Duas gerências aninhadas: vale a mais específica.
- Sessão do Codex e do Claude Code no mesmo `cwd`: mesma sala, mesmo andar (a regra de sala não muda).
- Modo demonstração (`?mock=1`, `npm run demo`): sem andares, igual a hoje, a menos que o simulador de demonstração
  ganhe dados de andar (opcional, só para captura de tela).
- Caminho antigo `/home/caminhao/codeStage` (de root, fora de `coding`): fica no térreo se não estiver na lista. O dono
  pode listá-lo também.

## Testes

- Unidade: `floorOf` (aninhamento, prefixo por segmento, `praxis.` com ponto, raiz da gerência, sem gerência); leitura e
  normalização de `HABBLAUD_FLOORS`; `SlotAllocator` por andar.
- Modelo: snapshot com `floor` por sala e `floors` só com andares vivos.
- Cliente: filtro do snapshot por andar; seletor com contagens e sinal de "precisa de você"; troca automática de andar
  ao selecionar agente em outro; volta ao térreo quando o andar esvazia.
- World: teste de que a projeção não muda com andares.
- Gate: `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`.
- Integração real: subir o Habblaud com `HABBLAUD_FLOORS` e sessões reais em `codeStage`, `praxis.` e `vigia`, e
  conferir o seletor, as salas por andar e o alerta.

## Entrega

- Branch `feature/andares-por-gerencia`, a partir da `main` atualizada.
- `CHANGELOG.md`, seção "Não lançado": andares por gerência e a variável `HABBLAUD_FLOORS`. README (pt-BR e os demais
  idiomas existentes) documenta a variável e o seletor.
- Versão nova (minor, funcionalidade) e tag criadas na `main` só depois do merge, que depende de aprovação do dono.
- `docs/HANDOFF.md` criado e atualizado.

## Riscos

- `client/src/world/sim/sim.ts` tem quase 2000 linhas. Filtrar o snapshot antes dele, sem mexer na lógica, é o que
  mantém o risco baixo.
- Descartar a `Sim` ao trocar de andar perde o movimento em curso (aceito).
- Alerta num andar escondido: se o sinal no seletor falhar, o dono perde um pedido de permissão. Coberto por teste.
