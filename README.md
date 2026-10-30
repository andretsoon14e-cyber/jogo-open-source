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

O padrão para novos jogadores é **FPS sem limite**. Quem já tinha um limite salvo mantém sua escolha: em **Configurações → Quantidade de FPS**, selecione `∞` para liberar quadros acima de 120. A taxa real depende do monitor, navegador e aparelho. O modo gráfico **Leve** reduz a resolução interna e usa iluminação mais simples; o balanço das árvores e os sons das criaturas também podem ser desligados nas configurações.

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
npm run test:benchmark
```

`APP_URL` pode apontar o teste de navegação para outro endereço. Opcionalmente, `CHROMIUM_EXECUTABLE_PATH` permite usar um Chromium já instalado. Para verificar também o aviso de multiplayer sem banco, execute o teste de navegação com `EXPECT_NO_DATABASE=1` no ambiente. O benchmark mede intervalos e tempo de CPU em cenas de floresta, ruínas, neve e combate; os resultados dependem do ambiente e não garantem uma taxa de FPS em outros aparelhos.

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
