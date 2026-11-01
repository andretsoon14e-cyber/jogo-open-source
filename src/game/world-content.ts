export interface SiteDefinition {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  radius: number;
  sprite: string;
  color: string;
  lore: string;
  reward: Partial<Record<"wood" | "stone" | "fiber" | "food" | "iron" | "crystal", number>>;
  guardian: "imp" | "crawler" | "stalker" | "brute" | "hulk" | "spitter" | "bat" | "slime" | "demon" | "lizard";
}

const T = 32;
export const GLACIER = { x: 137 * T, y: 43 * T, radius: 21 * T };
/** Rocky mineral basin inspired by the supplied crystal-field reference. */
export const MINERAL_BASIN = { x: 76 * T, y: 40 * T, rx: 15 * T, ry: 10 * T };
export const SITES: SiteDefinition[] = [
  { id: "roots", name: "Santuário das Raízes", subtitle: "Pedra antiga · floresta viva", x: 45 * T, y: 77 * T, radius: 180, sprite: "ruin_roots", color: "#b4d76d", lore: "As raízes guardam os nomes de quem chegou antes. No altar, um antigo caçador deixou suprimentos.", reward: { wood: 20, food: 5, fiber: 15 }, guardian: "brute" },
  { id: "echo", name: "Torre dos Ecos", subtitle: "Uma torre que o tempo esqueceu", x: 65 * T, y: 61 * T, radius: 180, sprite: "ruin_tower", color: "#d8ac7b", lore: "O vento atravessa a torre como uma voz. Um mapa gasto revela um depósito de ferramentas.", reward: { stone: 25, iron: 8 }, guardian: "bat" },
  { id: "arch", name: "Arco dos Guardiões", subtitle: "Passagem dos antigos", x: 82 * T, y: 56 * T, radius: 160, sprite: "ruin_arch", color: "#c3d1dc", lore: "Ninguém se lembra de quem construiu o arco. A inscrição diz: a luz é o caminho de volta.", reward: { iron: 10, crystal: 3 }, guardian: "spitter" },
  { id: "garden", name: "Jardim Esquecido", subtitle: "Cerejeiras entre ruínas", x: 114 * T, y: 122 * T, radius: 190, sprite: "ruin_garden", color: "#efa6b7", lore: "Flores crescem onde antes havia uma casa. Você encontra sementes e provisões intactas.", reward: { food: 12, fiber: 20, wood: 12 }, guardian: "slime" },
  { id: "spiral", name: "Escadaria Partida", subtitle: "Uma vigília abandonada", x: 54 * T, y: 101 * T, radius: 165, sprite: "ruin_spiral", color: "#c9a080", lore: "Da escadaria ainda se vê o mar. Nos degraus, pequenas marcas apontam para o norte gelado.", reward: { stone: 18, iron: 6, food: 4 }, guardian: "bat" },
  { id: "bones", name: "Cripta de Marfim", subtitle: "O território dos necromantes", x: 151 * T, y: 105 * T, radius: 185, sprite: "ruin_columns", color: "#e7dfba", lore: "Colunas claras cercam um altar vazio. Sob a pedra há cristais — mas algo ouviu você chegar.", reward: { crystal: 8, iron: 15 }, guardian: "demon" },
  { id: "circle", name: "Círculo dos Ancestrais", subtitle: "Um segredo sob a neve", x: 133 * T, y: 47 * T, radius: 185, sprite: "ruin_circle", color: "#94dbf2", lore: "Sob o gelo, as pedras ainda estão mornas. O altar oferece um fragmento de energia glacial.", reward: { crystal: 10, iron: 18, food: 6 }, guardian: "hulk" },
  { id: "amber", name: "Gruta de Âmbar", subtitle: "Um abrigo na costa leste", x: 146 * T, y: 143 * T, radius: 175, sprite: "ruin_amber", color: "#efc867", lore: "A rocha dourada esconde um abrigo de marinheiros. As provisões foram deixadas para o próximo viajante.", reward: { wood: 30, food: 8, iron: 10 }, guardian: "slime" },
  { id: "necropolis", name: "Necrópole do Rei Caído", subtitle: "Ossos, pedra negra e fogo espectral", x: 165 * T, y: 68 * T, radius: 240, sprite: "necro_king", color: "#8fd36b", lore: "A coroa ainda brilha sobre o esqueleto colossal. Os necromantes ergueram torres ao redor do trono para guardar um núcleo corrompido.", reward: { crystal: 14, iron: 24, stone: 30 }, guardian: "demon" },
  { id: "scaled", name: "Templo Escamado", subtitle: "Ruínas úmidas dos homens-lagarto", x: 27 * T, y: 62 * T, radius: 210, sprite: "lizard_shrine", color: "#7ad58d", lore: "Totens com olhos de âmbar protegem um antigo viveiro. Os guerreiros escamados consideram o rio e seus cristais território sagrado.", reward: { food: 10, fiber: 18, crystal: 5, iron: 6 }, guardian: "lizard" },
];

export interface CreatureEntry {
  sprite: string; name: string; habitat: string; hp: number; damage: number; speed: string;
  attack: string; tip: string; category: string;
}
export const BESTIARY: CreatureEntry[] = [
  { sprite: "goblin", name: "Saqueador Verde", habitat: "Trilhas e acampamentos", hp: 14, damage: 10, speed: "Muito rápido", attack: "Estocada em matilha", tip: "Não deixe que cerquem você. Um golpe de espada interrompe a estocada.", category: "Bandos" },
  { sprite: "orc", name: "Orc Guerreiro", habitat: "Florestas e cavernas", hp: 90, damage: 20, speed: "Médio", attack: "Golpe de espada", tip: "Observe a preparação do ataque e role para o lado antes de contra-atacar.", category: "Povos da ilha" },
  { sprite: "zombie", name: "Zumbi Perdido", habitat: "Criptas e necrópoles", hp: 50, damage: 12, speed: "Lento", attack: "Golpe cambaleante", tip: "Afaste-se enquanto ele prepara o golpe e ataque pelos lados.", category: "Mortos-vivos" },
  { sprite: "skeleton", name: "Esqueleto Guerreiro", habitat: "Criptas e ruínas", hp: 55, damage: 15, speed: "Médio", attack: "Golpe de lâmina", tip: "Observe a preparação e use a distância da espada.", category: "Mortos-vivos" },
  { sprite: "vampire", name: "Vampiro Noturno", habitat: "Necrópole e floresta sombria", hp: 92, damage: 20, speed: "Rápido", attack: "Investida", tip: "Ele se aproxima depressa; guarde energia para desviar.", category: "Mortos-vivos" },
  { sprite: "lich", name: "Lich da Necrópole", habitat: "Necrópole e criptas", hp: 105, damage: 18, speed: "Lento", attack: "Orbe necromântico", tip: "Aproxime-se entre os disparos e use obstáculos como cobertura.", category: "Mortos-vivos" },
  { sprite: "demonbat", name: "Morcego Infernal", habitat: "Torre dos Ecos e noites", hp: 19, damage: 9, speed: "Veloz", attack: "Mergulho rasante", tip: "Observe as asas. Role de lado quando o mergulho começar.", category: "Voadores" },
  { sprite: "iceslime", name: "Gota Glacial", habitat: "Lagos congelados", hp: 36, damage: 12, speed: "Lento", attack: "Salto gelado", tip: "O corpo comprime antes de saltar. Ataque durante a recuperação.", category: "Elementais" },
  { sprite: "ghost", name: "Alma Errante", habitat: "Floresta Sombria", hp: 30, damage: 10, speed: "Médio", attack: "Toque espectral", tip: "Fique perto de uma fogueira para conseguir ver a aproximação.", category: "Espíritos" },
  { sprite: "wraith", name: "Vigia do Crepúsculo", habitat: "Ruínas e escuridão", hp: 52, damage: 16, speed: "Rápido", attack: "Investida das sombras", tip: "Os olhos brilham antes de atacar. Não gaste toda a energia correndo.", category: "Espíritos" },
  { sprite: "skelmage", name: "Guardião de Marfim", habitat: "Caverna e Cripta", hp: 44, damage: 13, speed: "Médio", attack: "Orbe necromântico", tip: "Use a cerca como cobertura e aproxime-se entre os disparos.", category: "Mortos-vivos" },
  { sprite: "treant", name: "Raiz Furiosa", habitat: "Bosques ancestrais", hp: 135, damage: 26, speed: "Lento", attack: "Golpe de raízes", tip: "É forte contra construções. Repare a cerca enquanto Rian distrai o monstro.", category: "Colossos" },
  { sprite: "golem", name: "Sentinela de Pedra", habitat: "Encostas do norte", hp: 135, damage: 26, speed: "Lento", attack: "Punho rochoso", tip: "A preparação é longa. Aproveite para acertar e recuar.", category: "Colossos" },
  { sprite: "crystalgolem", name: "Colosso de Cristal", habitat: "Círculo dos Ancestrais", hp: 300, damage: 42, speed: "Muito lento", attack: "Ruptura glacial", tip: "Leve espada melhorada, comida e um companheiro. Não enfrente preso num canto.", category: "Colossos" },
  { sprite: "emberdemon", name: "Arauto das Brasas", habitat: "Cripta de Marfim · noite", hp: 105, damage: 24, speed: "Rápido", attack: "Garras em chamas", tip: "Pune quem corre em linha reta. Alterne rolagens e ataques curtos.", category: "Demônios" },
  { sprite: "lizardman", name: "Guerreiro Escamado", habitat: "Templo Escamado e margens dos rios", hp: 72, damage: 18, speed: "Rápido", attack: "Lança e golpe de cauda", tip: "Ele bloqueia pela frente. Role para o lado e ataque quando a lança passar.", category: "Povos da ilha" },
];

export type EquipmentKey = "harness" | "coat" | "charm";
export const EQUIPMENT = [
  { id: "harness" as const, name: "Arreio do Explorador", sprite: "equip_harness", desc: "Presilhas de couro para prender a ferramenta nas costas. Equipado desde o início.", cost: {}, effect: "Suporte para ferramentas" },
  { id: "coat" as const, name: "Casaco dos Pinheiros", sprite: "equip_coat", desc: "Reforço de couro e lã. Reduz o dano recebido em 18%.", cost: { fiber: 28, wood: 12, iron: 4 }, effect: "−18% de dano" },
  { id: "charm" as const, name: "Talismã do Degelo", sprite: "equip_charm", desc: "Cristal encontrado nas ruínas. Comida recupera 8 pontos extras de vida.", cost: { crystal: 6, iron: 8, fiber: 12 }, effect: "+8 de cura por comida" },
];
