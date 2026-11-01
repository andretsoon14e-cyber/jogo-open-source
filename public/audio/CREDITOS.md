# Áudio de Ilha da Última Luz

Este diretório contém as faixas prontas para o jogo, não apenas exemplos. Os arquivos foram editados, normalizados, cortados e/ou convertidos para MP3; os efeitos são agrupados em `effects.mp3` com os intervalos em `src/game/audio-cues.generated.json`. As gravações de terceiros utilizadas abaixo são identificadas como **CC0 1.0** em suas fontes. A dedicação CC0 não exige crédito, mas mantemos a procedência aqui: <https://creativecommons.org/publicdomain/zero/1.0/>.

## Composições do jogo

As melodias, sequências de notas e arranjos foram criados para este projeto em `scripts/compose-music.mjs`; não foram extraídos de músicas de terceiros. São quatro peças diferentes:

| Arquivo | Utilização | Duração aproximada |
| --- | --- | --- |
| `music/lobby.mp3` | Tema próprio do menu/lobby | 72 s |
| `music/day.mp3` | Exploração diurna | 63 s |
| `music/night.mp3` | Noite e introdução | 64 s |
| `music/siege.mp3` | Cerco/ataque noturno | 34 s |

Os arranjos usam amostras dos instrumentos **Meta Piano** e **Meta Nylon Guitar**, do [Meta Open Sound](https://github.com/facebookincubator/Meta-open-sound), licenciadas em CC0 nas pastas de cada instrumento: [piano](https://github.com/facebookincubator/Meta-open-sound/tree/main/systems/instruments/meta-piano), [violão](https://github.com/facebookincubator/Meta-open-sound/tree/main/systems/instruments/meta-nylon-guitar). Foram usadas as notas `INSPiano_Vel02_{E3,C4,G4,C5}_01.ogg` e `INSGuitarNylon_StringA_Vel01Finger_{A2,E3,A3,C4}_01.ogg`; as notas são reamostradas e combinadas com camadas e percussão sintetizadas no próprio script. O efeito de voz opcional do lobby é fala do sintetizador do navegador, não uma gravação nem canto.

## Efeitos de ações, monstros e animais

- **Kenney**, [RPG Audio](https://kenney.nl/assets/rpg-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Digital Audio](https://kenney.nl/assets/digital-audio) e [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), CC0. Usamos impactos, corte de madeira, passos, metais, itens, interface e sons viscosos. As versões convertidas para MP3 e o mapeamento por arquivo vieram do [catálogo jupixels/game-sounds](https://github.com/jupixels/game-sounds); as pastas `ww2` e `music`, que têm outras condições, **não** são usadas.
- **Ogrebane**, [Monster Sound Effects Pack](https://opengameart.org/content/monster-sound-effects-pack), e **rubberduck**, [80 CC0 creature SFX #2](https://opengameart.org/content/80-cc0-creture-sfx-2), CC0. Grunhidos, chamados e mortes foram obtidos das versões recortadas do diretório `creatures` de [dofus.js, commit 2f85bd4](https://github.com/AntoineROYERB/dofus.js/blob/2f85bd4bb6820bf4e861ecd8076ffaf7cdb02513/frontend/public/audio/CREDITS.md). Tipos grandes, pequenos, espectrais e mortos-vivos usam grupos e alturas diferentes; não se trata de uma gravação exclusiva para cada espécie.
- **blukotek**, [bone shell](https://freesound.org/people/blukotek/sounds/249319/), CC0; amostras `0`, `3` e `6` da versão derivada [C-Dogs SDL](https://github.com/cxong/cdogs-sdl/tree/master/sounds/footsteps/bones) são usadas como chocalhos dos esqueletos.
- **saha213131** ([goat.mp3](https://freesound.org/people/saha213131/sounds/683259/)), **Erokia** ([Goat Sound 2](https://freesound.org/people/Erokia/sounds/188182/)) e **DenisChardonnet** ([Bleating Goat #1](https://bigsoundbank.com/bleating-goat-1-s0279.html)), CC0. Balidos reais de cabra; recortes obtidos de [StarCup](https://github.com/teamstarcup/starcup/blob/main/Resources/Audio/_starcup/Animals/Goat/attributions.yml) e [Meadow 3D](https://github.com/ethanjojo/meadow-3d/blob/main/public/audio/CREDITS.md).
- **sarena6487528**, [Goose 2](https://freesound.org/people/sarena6487528/sounds/474952/), CC0. Chamados reais de ganso; recortes `goose_say2`, `goose_say3` e `goose_ask` obtidos de [StarCup](https://github.com/teamstarcup/starcup/blob/main/Resources/Audio/_starcup/Animals/Goose/attributions.yml).
- **morganpurkis** ([Rustling Grass 1](https://freesound.org/people/morganpurkis/sounds/396014/), [Rustling Grass 3](https://freesound.org/people/morganpurkis/sounds/396012/)), CC0. O coelho usa um farfalhar discreto de vegetação, não uma vocalização real. Os recortes de vegetação vieram de [nestcombe](https://github.com/bddap-bot/nestcombe/blob/main/game/audio/animals/sources.json).
- **coalcon** ([Hawaii 2](https://freesound.org/people/coalcon/sounds/636071/), [Hawaii 1](https://freesound.org/people/coalcon/sounds/636072/)) e **dubminister** ([Tropical Birds](https://freesound.org/people/dubminister/sounds/214676/)), CC0. Os recortes de pássaros vieram do banco de [Tidewater](https://github.com/dgreenheck/tidewater/blob/main/public/audio/CREDITS.md).

## Ambientes

Os loops foram recortados e receberam crossfade no ponto de repetição; o jogo suaviza seu volume conforme a proximidade.

| Arquivo | Gravação | Fonte da versão utilizada |
| --- | --- | --- |
| `ambient/wind.mp3` | **bruno.auzet**, [strong wind on coastal path](https://freesound.org/people/bruno.auzet/sounds/706471/), CC0 | [Tidewater](https://github.com/dgreenheck/tidewater/blob/main/public/audio/CREDITS.md) |
| `ambient/sea.mp3` | **chris_dagorne**, [waves breaking on sandy beach](https://freesound.org/people/chris_dagorne/sounds/426074/), CC0 | [Tidewater](https://github.com/dgreenheck/tidewater/blob/main/public/audio/CREDITS.md) |
| `ambient/water.mp3` | **jackthemurray**, [Stream River Water Up Close](https://freesound.org/people/jackthemurray/sounds/433589/), CC0 | [STILL ambient sounds](https://github.com/Tafazzolian/still-sounds) |
| `ambient/fire.mp3` | **forfie**, [Fire Bonfire](https://freesound.org/people/forfie/sounds/364992/), CC0 | [STILL ambient sounds](https://github.com/Tafazzolian/still-sounds) |

## Recriar os arquivos

As faixas prontas já estão incluídas e não dependem desses programas para tocar. Para regenerá-las, instale Node.js e FFmpeg com `libmp3lame`, baixe as amostras CC0 citadas acima e organize-as segundo os caminhos em `scripts/compose-music.mjs` e `scripts/build-sound-bank.mjs`. Os scripts não baixam automaticamente outras fontes:

```bash
AUDIO_SOURCES=/caminho/instruments FFMPEG=/caminho/ffmpeg node scripts/compose-music.mjs
AUDIO_SOURCE_ROOT=/caminho/fontes KENNEY_ROOT=/caminho/game-sounds/sounds FFMPEG=/caminho/ffmpeg node scripts/build-sound-bank.mjs
```

Os nomes locais e arquivos de origem de cada recorte são explicitados no próprio script do banco de sons. A licença acima diz respeito aos **áudios listados**, não às artes opcionais CraftPix ou a outros arquivos do projeto, que têm suas próprias condições.
