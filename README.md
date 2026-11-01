# Ilha da Última Luz

Jogo de sobrevivência para navegador: explore a ilha, reúna recursos, construa uma base e enfrente as criaturas da noite. O projeto usa Next.js, React, TypeScript e um motor 2D baseado em canvas.

## Executar no computador

É necessário ter **Node.js 20.9 ou superior** e npm instalados.

```bash
npm ci
npm run dev
```

Abra o endereço mostrado no terminal, normalmente [http://localhost:3000](http://localhost:3000). O modo **Jogar sozinho** não precisa de banco de dados. O progresso e as pontuações locais ficam no armazenamento do navegador: limpar os dados do site ou trocar de navegador pode apagá-los ou torná-los indisponíveis. As chaves antigas de armazenamento foram preservadas para manter os saves e configurações da versão anterior.

## Multiplayer e placar compartilhado

Essas funções precisam de um PostgreSQL acessível ao servidor. Use um banco dedicado ao jogo, pois o comando de preparação sincroniza o esquema das tabelas:

1. Copie `.env.example` para `.env.local` e substitua `DATABASE_URL` pela conexão do seu banco. Não envie esse arquivo ao GitHub.
2. Prepare as tabelas e reinicie o servidor:

   ```bash
   npm run db:push
   npm run dev
   ```

Sem o banco, o modo solo continua disponível e o placar usa os dados locais do navegador. A rota `/api/health` informa se o banco está acessível.

O multiplayer usa salas com código e sincronização básica dos jogadores; não há autenticação nem proteção antifraude no placar. Use-o em uma rede confiável, sem expor o servidor à internet pública até adicionar essas proteções. Para acessar de outros dispositivos na rede local, execute `npm run build` e depois `npm run start -- --hostname 0.0.0.0`; nos outros dispositivos, abra o endereço de rede da máquina na porta 3000.

## Desempenho e efeitos

O padrão para novos jogadores é **FPS sem limite**. Quem já tinha um limite salvo mantém sua escolha: em **Configurações → Quantidade de FPS**, selecione `∞` para liberar quadros acima de 120. A taxa real depende do monitor, navegador e aparelho. O modo gráfico **Leve** reduz a resolução interna, usa iluminação mais simples e exibe menos folhas. O balanço das árvores, os sons das criaturas, o vento, os sons de riachos/fogueiras e as artes opcionais podem ser desligados separadamente nas configurações. Os sons são sintetizados pelo navegador, não são gravações; respeitam o volume de efeitos e a proximidade. Se estiverem mudos, confirme o volume e toque/clique na interface ou pressione uma tecla: navegadores podem bloquear áudio até um gesto do jogador. Partículas da fogueira e da introdução usam o tempo decorrido, não a quantidade de quadros; trechos de cerca em resolução 1× são reutilizados em cache.

[Veja as capturas, animações e amostras de áudio das melhorias](docs/previas-2026-10-30/).

## Artes CraftPix opcionais

Os ZIPs originais não são publicados neste repositório. Para usar localmente os pacotes CraftPix fornecidos, guarde os ZIPs em uma pasta no seu computador, instale as dependências de desenvolvimento e execute:

```bash
npm ci
npm run import:craftpix -- "/caminho/para/os-zips"
npm run dev
```

É possível informar arquivos ZIP individuais em vez de uma pasta. O importador lê apenas os arquivos necessários, não extrai caminhos arbitrários e cria atlas compactos em `public/craftpix/`, pasta ignorada pelo Git. Importe **antes** de iniciar o servidor; se ele já estiver aberto, reinicie-o e recarregue o navegador. Em produção, importe antes de `npm run build` e reinicie `npm run start`. Para remover a instalação local, apague `public/craftpix/` e reinicie o servidor.

São usados os três níveis de corpo e cabeça do espadachim; o nível visual acompanha o nível da espada. Rian usa uma variante do mesmo personagem com cabelo azulado, para diferenciá-lo sem trocar de estilo. A espada original e sua animação aparecem nos níveis 1–3, enquanto o machado, a picareta e as espadas mais avançadas mantêm o visual existente. As três versões de orc podem aparecer em florestas e cavernas e entram no bestiário. Árvores, macieiras, palmeiras, uma planta pequena e a cesta de suprimentos usam os sprites correspondentes; outras espécies mantêm sua arte anterior. A opção **Configurações → Artes CraftPix e referências** desliga as artes importadas. Sem os pacotes, o jogo continua funcionando com a arte procedural, inclusive para os orcs. O ZIP da base feminina contém apenas uma base sem roupa/cabelo completos e foi preservado para uso posterior, não incluído como personagem jogável.

Os pacotes adicionais de **vila** e **torres de arqueiros** podem ser importados pelo mesmo comando: as casas e uma torre servem como alternativa quando as referências equivalentes não estão instaladas. O pacote de interface também foi examinado, mas não substitui os painéis existentes sem um pedido de redesign.

Os [termos da CraftPix](https://craftpix.net/file-licenses/) permitem certos usos em jogos, mas restringem a redistribuição de arquivos reutilizáveis. A importação é para uso local e não substitui a revisão da licença: os PNGs gerados são acessíveis pelo navegador. Antes de publicar ou hospedar uma versão que os inclua, confirme com a CraftPix se a forma de distribuição é permitida.

## Referências visuais enviadas

O segundo importador usa **as prévias já enviadas**, não arquivos originais de sprite. Com as imagens `image-N.png` disponíveis localmente e as dependências instaladas, execute:

```bash
npm run import:referencias -- "/caminho/para/as-imagens-enviadas"
npm run dev
```

Em produção, importe antes de `npm run build` e reinicie `npm run start`. A pasta gerada `public/referencias/` é ignorada pelo Git; pode ser apagada para retornar ao jogo sem essas artes. Cada grupo é opcional e os arquivos reconhecidos são verificados pelo hash antes dos recortes. As imagens do arqueiro aliado (`30/31`) precisam estar juntas; o arqueiro de capuz usa `60/28`. As magas usam as prévias `62` e `65`, e os depósitos usam `52` e `54`. A opção **Artes CraftPix e referências** também ativa/desativa essa camada; sem ela ou com imagens ausentes, os sprites anteriores são mantidos.

- Após derrotar 20 monstros, a missão **Caçador** recruta Maya. O arqueiro agora é encontrado em um resgate separado; flechas de aliados não atingem jogadores ou companheiros. Saves que já possuíam o arqueiro mantêm uma única cópia e seu progresso equivalente (até o nível 3). Ter concluído a missão antiga sem possuir o arqueiro não o recruta automaticamente.
- Os moradores comuns usam roupas simples desarmadas, com variações de cores e sem profissões visuais de combate. Eles caminham com pausas e evitam obstáculos. Sem a arte opcional, mantêm um visual procedural simples.
- A vila ocupa uma área maior, com casas ampliadas e mais afastadas, além de mercado e capela. Próximo à base há um acampamento e, na caverna, uma entrada para o esgoto. A forja construída usa o exterior correspondente e mantém suas melhorias. Aproxime-se e use **E**, **X** no controle ou **Usar** na tela de toque. Para visitar a forja, abra sua oficina e escolha **Visitar interior da forja**.
- Essas construções são objetos fixos, sem a sombra de personagem. A barraca é sólida em todos os lados; as casas, a feira, a capela e as casas/forjas/torres construídas têm colisão aproximada para jogador e monstros, e flechas também são bloqueadas. Companheiros evitam as construções fixas quando a arte está presente, mas ainda podem atravessar cercas e outras construções colocadas pelo jogador; não há navegação completa por obstáculos. Saves antigos dentro de um desses limites podem sair. Sem a arte, as casas da vila e dos vilarejos usam um desenho simples e mantêm suas colisões; os demais objetos opcionais sem representação não deixam uma barreira invisível, e as construções do jogador mantêm a colisão do sprite anterior.
- O baú inicial da clareira permanece visível após a coleta, marcado como **VAZIO**, sem deixar a caixa antiga. Ele é sólido antes e depois de aberto, mas permite que um save antigo preso dentro saia. Como não foi enviada uma versão aberta da arte, o baú continua visualmente fechado. Se a arte opcional estiver desativada, o jogo usa o sprite antigo como fallback.
- As visitas permitem caminhar sobre os cenários e voltar ao exterior; a oficina continua acessível dentro da forja. As imagens são **prévias planas**: NPCs e objetos desenhados nelas são estáticos, suas colisões são aproximadas e não são salas montadas com peças independentes. WASD/setas, analógico ou botões na tela movimentam o personagem; Esc/B fecha a visita. No modo solo o mundo fica pausado, enquanto no multiplayer ele continua ativo. A visita é desenhada a até 60 quadros por segundo para economizar recursos; o limite normal do jogo continua configurável.
- Os ícones de espada, arco, machado, picareta, madeira, fibra, comida, ferro e cristal nas barras e no inventário usam recortes das imagens enviadas. Há seis variantes de arbustos e flores e uma imagem de fundo no menu. A pedra e qualquer elemento não disponível mantêm o visual anterior.
- Com as imagens de castelo importadas, a **muralha de pedra**, o portão com grade e a torre usam peças extraídas das prévias; sem as imagens, continuam funcionando com a arte anterior. A disposição circular adapta as peças à construção do jogo, não monta o castelo completo da imagem. Todos os recortes vieram de prévias comprimidas: nitidez e transparência são aproximações, não uma reprodução pixel a pixel dos originais. A montagem livre dos tiles ainda não foi convertida em sistema jogável.

As imagens fornecidas e os arquivos gerados permanecem locais. A autorização do usuário para o projeto não substitui as condições dos titulares das artes: confirme a licença de cada pacote antes de redistribuir ou hospedar imagens extraíveis.

## Rios, defesas e casas

As imagens `71`, `72`, `75`, `76`, `77` e `83` são opcionais no mesmo importador. Seus recortes de prévias mostram pontes de madeira/pedra, ondas, espinhos, barricadas, relâmpagos e quatro exemplos de casas. As pontes visuais são ajustadas aos trechos transitáveis já existentes e recortadas aos seus tiles: a água continua bloqueada e a geração do mundo não muda. As casas variam de forma estável na vila e nas construções, sem alterar os recursos gerados. Os exemplos não são um construtor livre de peças, e a arte pode ficar menos nítida do que um sprite original.

Na **Oficina da Clareira**, as receitas **Armadilha de espinhos** e **Barricada** permitem selecionar um dos quatro níveis antes de posicionar a peça dentro do território. O nível 1 está disponível desde o início; os níveis 2, 3 e 4 exigem reino 3, 6 e 10, respectivamente, e os dois últimos também precisam de forja. Os custos variam com a dificuldade e com a quantidade já construída, como nas demais receitas. O nível pertence à peça colocada; escolher outro não melhora as já existentes.

- Espinhos são atravessáveis e ferem todos os inimigos próximos por 8, 12, 18 ou 25 de dano, no máximo uma vez por ativação a cada 1,4 segundo. Não ferem o jogador ou seus aliados.
- Barricadas bloqueiam passagem e projéteis, podem ser atacadas pelos invasores e reparadas com madeira. Sua vida-base por nível é 200, 320, 480 e 700 (ajustada conforme a dificuldade). As duas defesas usam posição fixa, sem rotação.
- O relâmpago aparece brevemente quando o projétil da maga aliada acerta; é apenas visual, sem dano extra. Seus projéteis continuam respeitando obstáculos e não causam fogo amigo.

Sem as imagens ou com a opção **Artes CraftPix e referências** desativada, as defesas permanecem jogáveis com sprites simples e as pontes mantêm o terreno anterior. Saves antigos continuam válidos, e os novos guardam o nível selecionado e o de cada defesa.

## Vilarejos, criaturas e salto

A vila principal ganhou casas maiores e mais afastadas. Há quatro vilarejos menores ligados às trilhas: **Aldeia dos Pinheiros**, **Vila das Campinas**, **Vila do Riacho** e **Vila da Fronteira**. Cada um tem duas casas sólidas e moradores que circulam nas proximidades. Os bosques de outono e cerejeiras dão variedade a outras regiões, e pedras e depósitos foram espaçados sem remover recursos nem alterar sua ordem nos saves. Se uma construção de um save antigo ocupar o espaço de um vilarejo novo, esse vilarejo não aparece naquele save; a construção permanece no lugar.

As imagens opcionais `88` a `91` acrescentam quatro visitantes identificados, com uma pequena fala. As prévias mostram uma única pose frontal: por isso eles ficam parados, sem direção ou animação inventada. Moradores comuns continuam desarmados e com suas caminhadas; os especialistas recrutáveis continuam dependendo dos resgates e do treino. Caso uma imagem esteja ausente ou as artes estejam desativadas, o visitante usa o visual simples anterior.

A imagem `92` permite usar prévias recortadas de goblins, orcs, fantasmas, homens-lagarto, zumbis, demônios, vampiros, liches, esqueletos e morcegos, também no bestiário. Elas são poses estáticas que o jogo pode deslocar, espelhar e destacar durante o combate, não sprites direcionais animados. Orcs, zumbis, esqueletos, vampiros e liches têm alternativas locais sem essas artes; as novas famílias surgem nos biomas apropriados, com estatísticas e ataques próprios. O lich ataca à distância. O registro de criaturas já avistadas ou derrotadas continua válido. Os recortes das prévias são aproximações e podem ter imperfeições.

A esquiva agora mostra um arco de salto com sombra no chão e leve inclinação, sem girar o personagem inteiro. O movimento, a invulnerabilidade, o gasto de energia e a recarga continuam iguais.

## Arena, base e movimentação

As imagens `85` e `86` permitem importar os componentes da **Arena de treino**: piso, cerca, toldo, alvos, bonecos e suporte de armas. A receita aparece em **Construir** e ocupa uma área retangular dentro do perímetro; remova árvores e pedras antes de posicioná-la. Sem as imagens, a arena usa formas simples e continua funcionando. Na aba **Pessoas**, um arqueiro, uma maga ou um espadachim recrutado pode receber a tarefa **Treinar** e ir à arena. O treino visual não dispara projéteis nem causa dano; sem arena, eles ainda podem treinar na base.

Novas partidas começam com um perímetro menor e ganham anéis maiores pelas expansões. Saves anteriores mantêm a barraca, o raio e os encaixes do primeiro anel originais. Depois da escolta, Rian fica na base por padrão; em **Pessoas → Rian**, escolha **Acompanhar** para chamá-lo ou **Ficar na base** para dispensá-lo.

Árvores são espaçadas sem mudar seus índices nos saves. Quando cortadas, deixam um toco que pode ser quebrado com o machado para render mais três madeiras. Moradores caminham entre pontos da vila; animais alternam deslocamento, pausas e fuga. Monstros antecipam ataques e tentam contornar água e edifícios próximos, mas ainda não utilizam navegação completa pelo mapa. O avião e a explosão da introdução são desenhados no jogo, sem copiar a imagem de avião com marca d'água.

## Resgates, treinamento e profissões

O mapa marca com **!** quatro encontros independentes: um pequeno grupo de arqueiros, uma maga, um espadachim e um minerador. Depois que Rian terminar a escolta, aproxime-se, derrote as criaturas do encontro e converse para convidar **um** profissional por encontro. A tela **Pessoas** fica nas abas do caderno (ou pela tecla P); ali é possível designar os combatentes para acompanhar, defender a base ou treinar, e escolher entre mineração e descanso para o minerador. Os três defensores e o minerador são indivíduos fixos; ainda não há contratação ilimitada nem uma economia de salários.

Cada novo defensor começa no nível 1. O treino acontece em tempo de jogo, durante o dia, na arena ou na base e sem inimigos próximos: são necessários 45 segundos de treino para o nível 2 e 120 segundos acumulados para o nível 3. Para efetivar cada melhoria, construa uma forja e pague o equipamento mostrado na aba Pessoas. O nível 3 também requer cristal. Feche o caderno no modo solo para o tempo voltar a passar.

Com uma pedreira, o minerador designado produz **2 ferros a cada 45 segundos de trabalho diurno**, enquanto estiver perto dela e não houver criaturas próximas. Depois que o jogador coletar cristal pela primeira vez, ele produz também **1 cristal por ciclo**. Isso não é produção offline; as tarefas e o progresso são guardados no save. As posições dos encontros e as receitas são uma primeira implementação jogável, não um sistema completo de administração de uma cidade.

## Noites, queda e áudio

As primeiras noites começam com poucas criaturas. Limite, tamanho e frequência das ondas crescem gradualmente conforme os dias e a dificuldade; monstros procuram pontos separados. Ao cair, o jogador desperta ferido perto da base com pouca vida e energia. A pressão dos invasores e a dificuldade determinam o saque de recursos comuns e o vandalismo: cercas e plantações são mais expostas; no impossível, os estragos podem ser severos. Ferro, cristal, ferramentas e equipamentos são preservados. O relatório aparece na tela e, se o salvamento automático estiver ligado, a consequência não é aplicada novamente ao recarregar.

As músicas de menu, dia, noite e cerco são melodias originais sintetizadas localmente. O padrão de música é mais baixo; preferências já salvas continuam valendo. Pássaros aparecem no ambiente diurno, vento e água dependem da proximidade/opções, e criaturas e impactos usam efeitos curtos. Os controles de música, volume, criaturas e ambiente permanecem nas configurações.

## Biomas, fogueira e exploração

A ilha reúne floresta verde e sombria, encostas, caverna, ruínas, neve e os novos **Campos de Cristal**. Há três riachos adicionais e movimento de correnteza; a água continua bloqueando a passagem e as trilhas existentes permanecem acessíveis. Os minerais e rochas das prévias são usados quando importados, com alternativas procedurais sem elas. Animais e monstros variam conforme a região. Algumas variantes raras usam as criaturas existentes, têm mais vida e deixam cristais; quatro tesouros adicionais oferecem recursos uma única vez. Eles e as alterações nos recursos preservam os índices dos saves anteriores.

A fogueira tem arte redesenhada, cura o jogador ao redor e continua atravessável. Pisar nas chamas causa dano periódico e tremor, sem empurrar o personagem. A cura acontece ao lado, fora do centro das chamas.

## Expansão da base

Na **Oficina da Clareira**, role até **Expandir território**. São quatro tamanhos, com raios de 15, 20, 25 e 30 blocos. Cada expansão abre mais espaço para construções, aumenta o limite de casas em cinco e habilita um novo anel de cercas, sem apagar as construções ou o anel anterior. É preciso estar na base, ter os recursos indicados e cumprir os requisitos mostrados na oficina:

| Próximo território | Nível do reino | Estrutura necessária | Custo-base |
| --- | --- | --- | --- |
| 2 | 4 | Bancada | 100 madeira, 80 pedra |
| 3 | 8 | Forja | 180 madeira, 180 pedra, 30 ferro |
| 4 | 12 | Torre de Vigia | 280 madeira, 300 pedra, 80 ferro, 10 cristal |

A dificuldade e o aliado Tito alteram o preço efetivo; a oficina mostra os valores atuais. Ao selecionar **Cerca dupla** ou **Portão**, escolha **Anel 1–4** para continuar construindo em qualquer perímetro desbloqueado. Cada anel aceita um portão; as cercas são compradas em pares e podem ser colocadas individualmente para fechar lacunas depois do portão. Os trechos conectam-se aos vizinhos, aparecem como estruturas verticais mais altas e continuam podendo ser reparados; a muralha de pedra usa o desenho de castelo quando disponível. Os anéis externos podem criar fundações sobre rios, e um portão sobre água cria uma pequena passagem. As expansões, os perímetros, portões e fundações são restaurados ao carregar. Saves antigos mantêm o primeiro anel de 63 posições.

## Armas

Na **Mochila & equipamento**, escolha **Espada** ou **Arco** para o espaço 3. O arco ataca à distância, atinge criaturas e animais, não causa fogo amigo e compartilha as melhorias da espada; não consome um item de munição. A escolha é salva junto do progresso e saves anteriores começam com a espada. Ambas as armas funcionam mesmo sem as artes opcionais.

## Verificações

```bash
npm test             # testes das mecânicas e comportamento sem banco
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run build        # compilação de produção
```

Para os testes visuais/de navegação, instale também o navegador do Playwright (`npx playwright install chromium` e, se necessário, as bibliotecas do sistema). Com o jogo já rodando em outro terminal, execute:

```bash
npm run test:browser
npm run test:audio-browser     # gesto real, sinal dos efeitos e volume zero
npm run test:craftpix-browser  # usa atlas sintéticos, sem exigir os ZIPs
npm run test:referencias-browser # referências sintéticas, flechas e saves
npm run test:referencias-ui      # visitas, controles e telas pequenas
npm run test:benchmark
BENCH_CRAFTPIX=1 BENCH_REFERENCIAS=1 npm run test:benchmark # servidor aberto e artes importadas
```

`APP_URL` pode apontar os testes para outro endereço. Opcionalmente, `CHROMIUM_EXECUTABLE_PATH` permite usar um Chromium já instalado. Para verificar também o aviso de multiplayer sem banco, execute o teste de navegação com `EXPECT_NO_DATABASE=1` no ambiente; use `WITHOUT_CRAFTPIX=1 WITHOUT_REFERENCIAS=1` para testar o jogo sem as artes ou `EXPECT_CRAFTPIX=1` para validar a instalação presente. O benchmark mede intervalos, tempo de CPU e pico de partículas em floresta, ruínas, neve, combate e cercos; os resultados dependem do ambiente e não garantem uma taxa de FPS em outros aparelhos.

Para testar criação de sala, sincronização e placar com PostgreSQL, configure e prepare um **banco dedicado a testes** e execute `npm run test:db`. O teste cria e remove seus próprios dados; a criação de sala também remove salas antigas conforme a regra do jogo.

## Recursos visuais do arquivo importado

O ZIP recebido fazia referência a `/images/lobby.jpg`, mas não continha essa imagem. O menu usa uma das prévias enviadas quando ela foi importada; sem essa referência, volta ao degradê anterior. As fontes Nunito e Pixelify Sans, também ausentes no ZIP, foram recuperadas do Fontsource sob a licença SIL OFL 1.1; os textos de licença estão em `public/fonts/`.

## Organização

- `src/game/`: motor, geração do mundo, personagens, arte e áudio.
- `src/components/`: telas e interface do jogo.
- `src/app/`: página, estilos e rotas da API.
- `src/db/`: conexão e esquema do PostgreSQL.
- `tests/`: testes das mecânicas, navegação e renderização.

A licença do projeto ainda não foi definida.
