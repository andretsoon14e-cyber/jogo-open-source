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

O padrão para novos jogadores é **FPS sem limite**. Quem já tinha um limite salvo mantém sua escolha: em **Configurações → Quantidade de FPS**, selecione `∞` para liberar quadros acima de 120. A taxa real depende do monitor, navegador e aparelho. O modo gráfico **Leve** reduz a resolução interna e usa iluminação mais simples; o balanço das árvores, os sons das criaturas e as artes opcionais também podem ser desligados nas configurações. Partículas da fogueira e da introdução usam o tempo decorrido, não a quantidade de quadros; trechos de cerca em resolução 1× são reutilizados em cache.

[Veja as capturas, animações e amostras de áudio das melhorias](docs/previas-2026-10-30/).

## Artes CraftPix opcionais

Os ZIPs originais não são publicados neste repositório. Para usar localmente os pacotes CraftPix fornecidos, guarde os ZIPs em uma pasta no seu computador, instale as dependências de desenvolvimento e execute:

```bash
npm ci
npm run import:craftpix -- "/caminho/para/os-zips"
npm run dev
```

É possível informar arquivos ZIP individuais em vez de uma pasta. O importador lê apenas os arquivos necessários, não extrai caminhos arbitrários e cria atlas compactos em `public/craftpix/`, pasta ignorada pelo Git. Importe **antes** de iniciar o servidor; se ele já estiver aberto, reinicie-o e recarregue o navegador. Em produção, importe antes de `npm run build` e reinicie `npm run start`. Para remover a instalação local, apague `public/craftpix/` e reinicie o servidor.

São usados os três níveis de corpo e cabeça do espadachim; o nível visual acompanha o nível da espada. A espada original e sua animação aparecem nos níveis 1–3, enquanto o machado, a picareta e as espadas mais avançadas mantêm o visual existente. As três versões de orc podem aparecer em florestas e cavernas e entram no bestiário. Árvores, macieiras, palmeiras, uma planta pequena e a cesta de suprimentos usam os sprites correspondentes; outras espécies mantêm sua arte anterior. A opção **Configurações → Artes CraftPix** troca para o visual anterior. Sem os pacotes, o jogo continua funcionando com a arte procedural e os orcs novos não surgem. O ZIP da base feminina contém apenas uma base sem roupa/cabelo completos e foi preservado para uso posterior, não incluído como personagem jogável.

Os [termos da CraftPix](https://craftpix.net/file-licenses/) permitem certos usos em jogos, mas restringem a redistribuição de arquivos reutilizáveis. A importação é para uso local e não substitui a revisão da licença: os PNGs gerados são acessíveis pelo navegador. Antes de publicar ou hospedar uma versão que os inclua, confirme com a CraftPix se a forma de distribuição é permitida. Os desenhos originais dos arqueiros aliados e das demais referências continuam pendentes.

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
npm run test:benchmark
BENCH_CRAFTPIX=1 npm run test:benchmark  # servidor aberto e pacotes importados
```

`APP_URL` pode apontar os testes para outro endereço. Opcionalmente, `CHROMIUM_EXECUTABLE_PATH` permite usar um Chromium já instalado. Para verificar também o aviso de multiplayer sem banco, execute o teste de navegação com `EXPECT_NO_DATABASE=1` no ambiente; use `WITHOUT_CRAFTPIX=1` para testar o jogo sem as artes ou `EXPECT_CRAFTPIX=1` para validar a instalação presente. O benchmark mede intervalos, tempo de CPU e pico de partículas em floresta, ruínas, neve, combate e cercos; os resultados dependem do ambiente e não garantem uma taxa de FPS em outros aparelhos.

Para testar criação de sala, sincronização e placar com PostgreSQL, configure e prepare um **banco dedicado a testes** e execute `npm run test:db`. O teste cria e remove seus próprios dados; a criação de sala também remove salas antigas conforme a regra do jogo.

## Recursos visuais do arquivo importado

O ZIP recebido fazia referência a `/images/lobby.jpg`, mas não continha essa imagem. Por enquanto o menu usa o fundo em degradê que já existia no projeto; a arte original ou uma nova referência pode ser adicionada quando estiver disponível. As fontes Nunito e Pixelify Sans, também ausentes no ZIP, foram recuperadas do Fontsource sob a licença SIL OFL 1.1; os textos de licença estão em `public/fonts/`.

## Organização

- `src/game/`: motor, geração do mundo, personagens, arte e áudio.
- `src/components/`: telas e interface do jogo.
- `src/app/`: página, estilos e rotas da API.
- `src/db/`: conexão e esquema do PostgreSQL.
- `tests/`: testes das mecânicas, navegação e renderização.

A licença do projeto ainda não foi definida.
