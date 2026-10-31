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

O padrão para novos jogadores é **FPS sem limite**. Quem já tinha um limite salvo mantém sua escolha: em **Configurações → Quantidade de FPS**, selecione `∞` para liberar quadros acima de 120. A taxa real depende do monitor, navegador e aparelho. O modo gráfico **Leve** reduz a resolução interna, usa iluminação mais simples e exibe menos folhas. O balanço das árvores e as folhas, os sons das criaturas, o som do vento e as artes opcionais podem ser desligados nas configurações. As rajadas e os sons de monstros são gerados pelo navegador e respeitam o volume de efeitos. Partículas da fogueira e da introdução usam o tempo decorrido, não a quantidade de quadros; trechos de cerca em resolução 1× são reutilizados em cache.

[Veja as capturas, animações e amostras de áudio das melhorias](docs/previas-2026-10-30/).

## Artes CraftPix opcionais

Os ZIPs originais não são publicados neste repositório. Para usar localmente os pacotes CraftPix fornecidos, guarde os ZIPs em uma pasta no seu computador, instale as dependências de desenvolvimento e execute:

```bash
npm ci
npm run import:craftpix -- "/caminho/para/os-zips"
npm run dev
```

É possível informar arquivos ZIP individuais em vez de uma pasta. O importador lê apenas os arquivos necessários, não extrai caminhos arbitrários e cria atlas compactos em `public/craftpix/`, pasta ignorada pelo Git. Importe **antes** de iniciar o servidor; se ele já estiver aberto, reinicie-o e recarregue o navegador. Em produção, importe antes de `npm run build` e reinicie `npm run start`. Para remover a instalação local, apague `public/craftpix/` e reinicie o servidor.

São usados os três níveis de corpo e cabeça do espadachim; o nível visual acompanha o nível da espada. Rian usa uma variante do mesmo personagem com cabelo azulado, para diferenciá-lo sem trocar de estilo. A espada original e sua animação aparecem nos níveis 1–3, enquanto o machado, a picareta e as espadas mais avançadas mantêm o visual existente. As três versões de orc podem aparecer em florestas e cavernas e entram no bestiário. Árvores, macieiras, palmeiras, uma planta pequena e a cesta de suprimentos usam os sprites correspondentes; outras espécies mantêm sua arte anterior. A opção **Configurações → Artes CraftPix e referências** desliga as artes importadas. Sem os pacotes, o jogo continua funcionando com a arte procedural e os orcs novos não surgem. O ZIP da base feminina contém apenas uma base sem roupa/cabelo completos e foi preservado para uso posterior, não incluído como personagem jogável.

Os [termos da CraftPix](https://craftpix.net/file-licenses/) permitem certos usos em jogos, mas restringem a redistribuição de arquivos reutilizáveis. A importação é para uso local e não substitui a revisão da licença: os PNGs gerados são acessíveis pelo navegador. Antes de publicar ou hospedar uma versão que os inclua, confirme com a CraftPix se a forma de distribuição é permitida.

## Referências visuais enviadas

O segundo importador usa **as prévias já enviadas**, não arquivos originais de sprite. Com as imagens `image-N.png` disponíveis localmente e as dependências instaladas, execute:

```bash
npm run import:referencias -- "/caminho/para/as-imagens-enviadas"
npm run dev
```

Em produção, importe antes de `npm run build` e reinicie `npm run start`. A pasta gerada `public/referencias/` é ignorada pelo Git; pode ser apagada para retornar ao jogo sem essas artes. Cada grupo é opcional e os arquivos reconhecidos são verificados pelo hash antes dos recortes. As duas imagens do arqueiro precisam estar juntas. A opção **Artes CraftPix e referências** também ativa/desativa essa camada; sem ela ou com imagens ausentes, os sprites anteriores são mantidos.

- Após derrotar 20 monstros, a missão **Caçador** recruta Maya e um arqueiro aliado. Ele acompanha o jogador, usa flechas contra monstros e não causa dano ao jogador ou aos aliados. Saves antigos com essa missão concluída recebem o arqueiro uma vez ao carregar.
- A vila ocupa uma área maior, com casas ampliadas e mais afastadas, além de mercado e capela. Próximo à base há um acampamento e, na caverna, uma entrada para o esgoto. A forja construída usa o exterior correspondente e mantém suas melhorias. Aproxime-se e use **E**, **X** no controle ou **Usar** na tela de toque. Para visitar a forja, abra sua oficina e escolha **Visitar interior da forja**.
- Essas construções são objetos fixos, sem a sombra de personagem. A barraca é sólida em todos os lados; as casas, a feira, a capela e as casas/forjas/torres construídas têm colisão aproximada para jogador e monstros, e flechas também são bloqueadas. Companheiros ainda usam o caminho anterior e podem atravessá-las. Saves antigos dentro de um desses limites podem sair. Sem a arte, as estruturas fixas não deixam uma barreira invisível e as construídas mantêm a colisão do sprite anterior.
- O baú inicial da clareira permanece visível após a coleta, marcado como **VAZIO**, sem deixar a caixa antiga. Como não foi enviada uma versão aberta da arte, o baú continua visualmente fechado. Se a arte opcional estiver desativada, o jogo usa o sprite antigo como fallback.
- As visitas permitem caminhar sobre os cenários e voltar ao exterior; a oficina continua acessível dentro da forja. As imagens são **prévias planas**: NPCs e objetos desenhados nelas são estáticos, suas colisões são aproximadas e não são salas montadas com peças independentes. WASD/setas, analógico ou botões na tela movimentam o personagem; Esc/B fecha a visita. No modo solo o mundo fica pausado, enquanto no multiplayer ele continua ativo. A visita é desenhada a até 60 quadros por segundo para economizar recursos; o limite normal do jogo continua configurável.
- Os ícones de espada, arco, machado, picareta, madeira, fibra, comida, ferro e cristal nas barras e no inventário usam recortes das imagens enviadas. Há seis variantes de arbustos e flores e uma imagem de fundo no menu. A pedra e qualquer elemento não disponível mantêm o visual anterior.
- Com as imagens de castelo importadas, a **muralha de pedra**, o portão com grade e a torre usam peças extraídas das prévias; sem as imagens, continuam funcionando com a arte anterior. A disposição circular adapta as peças à construção do jogo, não monta o castelo completo da imagem. Todos os recortes vieram de prévias comprimidas: nitidez e transparência são aproximações, não uma reprodução pixel a pixel dos originais. Os outros itens, incluindo variantes de esqueletos e a montagem livre dos tiles, ainda não foram convertidos em elementos jogáveis.

As imagens fornecidas e os arquivos gerados permanecem locais. A autorização do usuário para o projeto não substitui as condições dos titulares das artes: confirme a licença de cada pacote antes de redistribuir ou hospedar imagens extraíveis.

## Expansão da base

Na **Oficina da Clareira**, role até **Expandir território**. São quatro tamanhos, com raios de 15, 20, 25 e 30 blocos. Cada expansão abre mais espaço para construções, aumenta o limite de casas em cinco e habilita um novo anel de cercas, sem apagar as construções ou o anel anterior. É preciso estar na base, ter os recursos indicados e cumprir os requisitos mostrados na oficina:

| Próximo território | Nível do reino | Estrutura necessária | Custo-base |
| --- | --- | --- | --- |
| 2 | 4 | Bancada | 100 madeira, 80 pedra |
| 3 | 8 | Forja | 180 madeira, 180 pedra, 30 ferro |
| 4 | 12 | Torre de Vigia | 280 madeira, 300 pedra, 80 ferro, 10 cristal |

A dificuldade e o aliado Tito alteram o preço efetivo; a oficina mostra os valores atuais. Ao selecionar **Cerca dupla** ou **Portão**, escolha **Anel 1–4** para continuar construindo em qualquer perímetro desbloqueado. Cada anel aceita um portão; as cercas são compradas em pares e podem ser colocadas individualmente para fechar lacunas depois do portão. Os trechos conectam-se aos vizinhos e continuam podendo ser reparados. Os anéis externos podem criar fundações sobre rios, e um portão sobre água cria uma pequena passagem. As expansões, os perímetros, portões e fundações são restaurados ao carregar. Saves antigos mantêm o primeiro anel de 63 posições.

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
