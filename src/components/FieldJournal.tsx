"use client";

import { memo, useEffect, useState } from "react";
import { getCharacterUrl, getSpriteUrl } from "@/game/sprites";
import { hasCraftOrcs } from "@/game/craftpix";
import { hasReferenceScene, referenceIconUrl, referenceObjectUrl, referenceSpikeUrl } from "@/game/reference-art";
import { GAME_TITLE } from "@/game/identity";
import { BESTIARY, EQUIPMENT, SITES, type EquipmentKey } from "@/game/world-content";
import { RES_LABEL, TOOL_LABEL, type GamePanel, type Snapshot, type ResKey, type ToolKey, type CombatWeapon, type FenceStyle, type DefenseTier, type SpecialistId, type SpecialistDuty } from "@/game/engine";
import { Icon } from "./Icons";

export const SpriteThumb = memo(function SpriteThumb({ name, size = 46, character = false, view = "down", tool = "axe", craftPix = true, level = 1 }: { name: string; size?: number; character?: boolean; view?: "up" | "down" | "side"; tool?: ToolKey | "bow"; craftPix?: boolean; level?: number }) {
  const [url, setUrl] = useState("");
  // Sprites are generated with a browser canvas, unavailable during SSR.
  useEffect(() => {
    const refresh = () => {
      const barricades = ["barricade_1", "barricade_2", "barricade_3", "barricade_4"] as const;
      const object = name === "fence_stone" ? "castle_wall" : name === "gate_stone" ? "castle_gate" : name === "tower" ? "castle_tower" : name === "barricade" ? barricades[Math.max(0, Math.min(3, level - 1))] : null;
      setUrl(character ? getCharacterUrl(name, view, tool, craftPix, level) : (craftPix && name === "spike_trap" && referenceSpikeUrl(level)) || (craftPix && object && referenceObjectUrl(object)) || (craftPix && referenceIconUrl(name)) || getSpriteUrl(name, craftPix));
    };
    refresh();
    window.addEventListener("craftpix-ready", refresh);
    window.addEventListener("reference-art-ready", refresh);
    return () => { window.removeEventListener("craftpix-ready", refresh); window.removeEventListener("reference-art-ready", refresh); };
  }, [name, character, view, tool, craftPix, level]);
  if (!url) return <span style={{ width: size, height: size }} className="inline-block" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" draggable={false} src={url} width={size} height={size} style={{ width: size, height: size, objectFit: "contain", imageRendering: "pixelated" }} />;
});

interface Props {
  panel: Exclude<GamePanel, "none" | "reference">;
  snap: Snapshot;
  craftPix: boolean;
  onClose: () => void;
  onPanel: (panel: Exclude<GamePanel, "none" | "reference">) => void;
  onReferenceForge: () => void;
  onBuild: (id: string) => void;
  onUpgrade: (tool: ToolKey) => void;
  onCraftEquipment: (id: EquipmentKey) => void;
  onFenceStyle: (style: FenceStyle) => void;
  onFenceRing: (ring: number) => void;
  onDefenseTier: (tier: DefenseTier) => void;
  onExpandTerritory: () => void;
  onTool: (tool: ToolKey) => void;
  onCombatWeapon: (weapon: CombatWeapon) => void;
  onEat: () => void;
  onSpecialistDuty: (id: SpecialistId, duty: SpecialistDuty) => void;
  onSpecialistUpgrade: (id: SpecialistId) => void;
}

const resourceNames: ResKey[] = ["wood", "stone", "fiber", "food", "iron", "crystal"];
const titleFor = { build: "Oficina da Clareira", forge: "Forja & melhorias", inventory: "Mochila & equipamento", bestiary: "O Diário da Ilha", people: "Pessoas & tarefas" };

function Costs({ cost, inv, craftPix }: { cost: Partial<Record<ResKey, number>>; inv: Record<ResKey, number>; craftPix: boolean }) {
  return <div className="journal-costs">{Object.entries(cost).map(([k,n]) => (
    <div key={k} className={`flex items-center gap-2 ${inv[k as ResKey] >= (n ?? 0) ? "text-[#426844]" : "text-[#a34332]"}`}>
      <SpriteThumb name={`it_${k}`} size={23} craftPix={craftPix} />
      <span className="text-xs"><b>{n}</b> {RES_LABEL[k as ResKey]} <span className="opacity-60">/ {inv[k as ResKey]}</span></span>
    </div>
  ))}</div>;
}

function InventoryGrid({ snap, craftPix, compact = false, onEat }: { snap: Snapshot; craftPix: boolean; compact?: boolean; onEat?: () => void }) {
  return <div>
    <div className={`grid gap-1.5 ${compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
      {resourceNames.map((key) => <div key={key} className="journal-slot flex flex-col items-center justify-center relative p-2" title={RES_LABEL[key]}>
        <SpriteThumb name={`it_${key}`} size={compact ? 34 : 44} craftPix={craftPix} />
        <span className="absolute top-1 right-1.5 font-display text-sm font-bold text-[#4f3325]">{snap.inv[key]}</span>
        {!compact && <span className="text-[9px] mt-1 opacity-60">{RES_LABEL[key]}</span>}
      </div>)}
    </div>
    {!compact && <div className="mt-3 flex justify-between items-center text-xs">
      <span className="text-[#896742]">Os recursos são coletados automaticamente.</span>
      {onEat && <button className="journal-button small" disabled={!snap.inv.food || snap.hp >= snap.maxHp} onClick={onEat}>Comer fruta · +{snap.equipment.charm ? 30 : 22} vida</button>}
    </div>}
  </div>;
}

export default function FieldJournal(props: Props) {
  const { panel, snap, onClose } = props;
  const [selected, setSelected] = useState("campfire");
  const [bookTab, setBookTab] = useState<"creatures" | "places">("creatures");
  const [creatureIndex, setCreatureIndex] = useState(0);
  const [siteIndex, setSiteIndex] = useState(0);
  const [upgradeTool, setUpgradeTool] = useState<ToolKey>("axe");
  const [characterView, setCharacterView] = useState<"down" | "up" | "side">("up");
  const recipe = snap.buildOptions.find((b) => b.id === selected) ?? snap.buildOptions[0];
  const defenseRecipe = recipe.id === "spike_trap" || recipe.id === "barricade";
  const creatures = BESTIARY.filter((entry) => entry.sprite !== "orc" || snap.seenCreatures.includes("orc") || (props.craftPix && hasCraftOrcs()));
  const creature = creatures[Math.min(creatureIndex, creatures.length - 1)];
  const site = SITES[siteIndex];
  const upgrade = snap.upgradeOptions.find((entry) => entry.tool === upgradeTool)!;

  return <div className="journal-backdrop" onClick={onClose}>
    <section className="journal-frame" role="dialog" aria-modal="true" aria-label={titleFor[panel]} onClick={(e) => e.stopPropagation()}>
      <header className="journal-heading">
        <div><span className="journal-eyebrow">{GAME_TITLE.toUpperCase()} · CADERNO DO EXPLORADOR</span><h2>{titleFor[panel]}</h2></div>
        <button className="journal-close" aria-label="Fechar caderno" onClick={onClose}><Icon name="close" size={19} /></button>
      </header>
      <nav className="journal-tabs" aria-label="Seções do caderno">
        {([ ["build","Construir","build"], ["forge","Melhorar","sword"], ["inventory","Mochila","bag"], ["people","Pessoas","users"], ["bestiary","Registros","help"] ] as const).map(([key,title,icon]) => (
          <button key={key} className={panel === key ? "active" : ""} onClick={() => props.onPanel(key)}><Icon name={icon} size={15} /><span>{title}</span></button>
        ))}
      </nav>

      {panel === "build" && <div className="journal-workshop">
        <aside className="journal-page">
          <h3 className="journal-ribbon">Receitas</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {snap.buildOptions.map((b) => <button key={b.id} title={b.name} className={`journal-slot relative ${b.id === recipe.id ? "selected" : ""}`} onClick={() => setSelected(b.id)}>
              <SpriteThumb name={b.id === "campfire" ? "campfire0" : b.id === "wall" ? `fence_${snap.fenceStyle}` : b.id === "gate" ? `gate_${snap.fenceStyle}` : b.id} size={52} craftPix={props.craftPix} level={snap.defenseTier} />
              {b.id === "wall" && <b className="absolute bottom-0 right-1 font-display text-[#6c492c] text-xs">×{snap.fencePieces}</b>}
              {b.locked && <span className="absolute right-1 top-0.5 text-xs opacity-60">•</span>}
            </button>)}
          </div>
          <p className="text-[10px] leading-relaxed mt-4 text-[#866741]">Selecione uma receita. Cercas vêm em <b>pares</b>; lacunas isoladas podem ser fechadas com uma peça.</p>
          <div className="mt-4 border-t border-[#9f7c4c]/30 pt-3"><span className="journal-eyebrow">SEU REINO</span><p className="font-display text-xl">Nível {snap.baseLevel}</p><p className="text-xs opacity-65">{snap.walls} trechos · portão {snap.gateState}</p></div>
        </aside>
        <main className="journal-page recipe-detail">
          <span className="journal-eyebrow">PLANTA DE CONSTRUÇÃO</span>
          <div className={`recipe-art ${defenseRecipe ? "defense-recipe-art" : ""}`}><SpriteThumb name={recipe.id === "campfire" ? "campfire0" : recipe.id === "wall" ? `fence_${snap.fenceStyle}` : recipe.id === "gate" ? `gate_${snap.fenceStyle}` : recipe.id} size={defenseRecipe ? 108 : 128} craftPix={props.craftPix} level={snap.defenseTier} /></div>
          {defenseRecipe && <div className="my-2">
            <p className="text-center text-xs font-bold text-[#785939] mb-1">Nível da defesa</p>
            <div role="group" aria-label="Escolher nível da defesa" className="defense-tier-grid">
              {snap.defenseTiers.map((option) => <button type="button" key={option.tier} aria-pressed={snap.defenseTier === option.tier} disabled={option.locked} title={option.reason || (recipe.id === "spike_trap" ? `${option.spikeDamage} de dano` : `${option.barricadeHp} de vida`)} onClick={() => props.onDefenseTier(option.tier)} className={`journal-button small ${snap.defenseTier === option.tier ? "" : "muted"}`}>Nv. {option.tier}</button>)}
            </div>
            <p className="text-center text-[10px] text-[#785939] mt-2">Níveis 2, 3 e 4 exigem reino 3, 6 e 10; os dois últimos também precisam de forja.</p>
          </div>}
          {recipe.id === "wall" && <div className="grid grid-cols-2 gap-1.5 mb-4">
            {snap.fenceStyles.map((style) => <button key={style.id} disabled={style.locked} title={style.desc} onClick={() => props.onFenceStyle(style.id)} className={`journal-slot min-h-20! p-1! flex-col relative ${snap.fenceStyle === style.id ? "selected" : ""} ${style.locked ? "opacity-45" : ""}`}>
              <SpriteThumb name={`fence_${style.id}`} size={48} />
              <b className="font-display text-[11px] leading-none">{style.name}</b>
              <small className="text-[9px] opacity-65">{style.hp} vida{style.locked ? " · bloqueada" : ""}</small>
            </button>)}
          </div>}
          {(recipe.id === "wall" || recipe.id === "gate") && <div className="my-3">
            <p className="text-center text-xs font-bold text-[#785939] mb-1">Perímetro de construção</p>
            <div role="group" aria-label="Escolher perímetro" className="flex justify-center flex-wrap gap-1">
              {Array.from({ length: snap.territory.level }, (_, i) => <button type="button" key={i} aria-pressed={snap.fenceRing === i + 1} onClick={() => props.onFenceRing(i + 1)} className={`journal-button small ${snap.fenceRing === i + 1 ? "" : "muted"}`}>Anel {i + 1}</button>)}
            </div>
          </div>}
          <h3 className="font-display text-2xl text-center">{recipe.name}</h3>
          <p className="text-xs leading-relaxed text-center text-[#785939] my-2">{recipe.desc}</p>
          <div className="border-y border-[#ad8b5e]/35 py-3 my-4"><Costs cost={recipe.cost} inv={snap.inv} craftPix={props.craftPix} /></div>
          <button className="journal-button w-full" disabled={recipe.locked || !recipe.affordable} onClick={() => props.onBuild(recipe.id)}>
            {recipe.locked ? recipe.lockReason : !recipe.affordable ? "Faltam materiais" : recipe.id === "wall" ? `Preparar ${snap.fencePieces} ${snap.fencePieces === 1 ? "cerca" : "cercas"}` : "Preparar construção"}
          </button>
          <p className="mt-2 text-center text-[10px] opacity-65">Os materiais só são gastos ao confirmar no chão.</p>
        </main>
        <aside className="journal-page journal-side">
          <h3 className="journal-ribbon">Materiais</h3><InventoryGrid snap={snap} craftPix={props.craftPix} compact />
          <div className="mt-5 text-[11px] leading-relaxed text-[#785939]">
            <h4 className="font-display text-base mb-1">Como colocar</h4>
            <p>Mouse ou direção do personagem para posicionar.</p>
            <p className="mt-2"><b>J / clique</b> confirma · <b>ESC</b> cancela.</p>
            <p className="mt-2">Cercas: <b>Q/E · LB/RB · setas na tela</b> giram pelo perímetro.</p>
          </div>
        </aside>
        <section className="journal-page col-span-full mt-1" aria-label="Expansão do território">
          <h3 className="journal-ribbon">Expandir território</h3>
          <p className="text-xs text-[#785939] leading-relaxed mb-3">Território {snap.territory.level}/{snap.territory.maxLevel} · raio {snap.territory.radius / 32} blocos{snap.territory.nextRadius ? ` → ${snap.territory.nextRadius / 32} blocos` : " · espaço máximo"}. A expansão abre mais espaço para casas e um novo perímetro de cercas e muralhas, sem remover os anteriores.</p>
          {snap.territory.nextRadius && <div className="mb-3"><Costs cost={snap.territory.cost} inv={snap.inv} craftPix={props.craftPix} /></div>}
          {snap.territory.reason && <p className="text-xs text-[#8d4c36] mb-2">{snap.territory.reason}</p>}
          <button type="button" className="journal-button w-full" disabled={snap.territory.locked || !snap.territory.affordable} onClick={props.onExpandTerritory}>Ampliar território</button>
        </section>
      </div>}

      {panel === "forge" && <div className="journal-workshop">
        <aside className="journal-page"><h3 className="journal-ribbon">Ferramentas</h3>
          {(["axe","pick","sword"] as ToolKey[]).map((tool) => <button key={tool} className={`journal-row ${upgradeTool === tool ? "active" : ""}`} onClick={() => setUpgradeTool(tool)}><SpriteThumb name={`tool_${tool}`} size={46} craftPix={props.craftPix} /><span>{TOOL_LABEL[tool]}<small>Nível {snap.tools[tool]}</small></span></button>)}
        </aside>
        <main className="journal-page recipe-detail"><span className="journal-eyebrow">TRABALHO DE FERREIRO</span><div className="recipe-art"><SpriteThumb name={`tool_${upgradeTool}`} size={126} craftPix={props.craftPix} /></div>
          <h3 className="font-display text-2xl text-center">{TOOL_LABEL[upgradeTool]}</h3><p className="text-center font-display text-lg text-[#488267]">Nível {upgrade.level} → {Math.min(5,upgrade.nextLevel)}</p>
          <div className="my-4 py-3 border-y border-[#ad8b5e]/35"><Costs cost={upgrade.cost} inv={snap.inv} craftPix={props.craftPix} /></div>
          <button className="journal-button w-full" disabled={upgrade.locked || !upgrade.affordable} onClick={() => props.onUpgrade(upgradeTool)}>{upgrade.locked ? upgrade.lockReason : upgrade.affordable ? "Forjar melhoria" : "Faltam materiais"}</button>
          {props.craftPix && hasReferenceScene("forge") && <button className="journal-button muted w-full mt-2" onClick={props.onReferenceForge}>Visitar interior da forja</button>}
          <p className="text-[11px] opacity-65 mt-3 text-center">Metais e lâminas mudam conforme o nível. A partir do nível 4, Bren precisa estar na sua equipe.</p>
        </main>
        <aside className="journal-page journal-side"><h3 className="journal-ribbon">Inventário</h3><InventoryGrid snap={snap} craftPix={props.craftPix} compact /><div className="flex justify-center mt-5"><SpriteThumb name="forge" size={100} /></div></aside>
      </div>}

      {panel === "inventory" && <div className="p-4 sm:p-6 grid md:grid-cols-[220px_1fr] gap-5">
        <aside className="journal-page text-center"><h3 className="journal-ribbon">Explorador</h3><div className="character-paper"><SpriteThumb name="player" character size={160} view={characterView} tool={snap.heldTool === "sword" && snap.combatWeapon === "bow" ? "bow" : snap.heldTool} craftPix={props.craftPix} level={snap.tools.sword} /></div>
          <div className="flex justify-center gap-1 mb-3">{([["down","Frente"],["up","Costas"],["side","Lado"]] as const).map(([key,label]) => <button key={key} className={`journal-button small ${characterView === key ? "" : "muted"}`} onClick={() => setCharacterView(key)}>{label}</button>)}</div>
          <p className="font-display text-lg">Seu equipamento</p><p className="text-[11px] opacity-65">A ferramenta fora de uso fica presa no arreio das costas.</p>
          <div className="grid grid-cols-3 gap-1 mt-4">{(["axe","pick","sword"] as ToolKey[]).map((t) => {
            const bow = t === "sword" && snap.combatWeapon === "bow";
            return <button key={t} title={`Equipar ${bow ? "Arco" : TOOL_LABEL[t]}`} className={`journal-slot ${snap.heldTool === t ? "selected" : ""}`} onClick={() => props.onTool(t)}><SpriteThumb name={`tool_${bow ? "bow" : t}`} size={40} craftPix={props.craftPix} /><small className="text-[9px]">Nv. {snap.tools[t]}</small></button>;
          })}</div>
        </aside>
        <main><div className="journal-page"><h3 className="journal-ribbon">Inventário</h3><InventoryGrid snap={snap} craftPix={props.craftPix} onEat={props.onEat} /></div>
          <div className="journal-page mt-4">
            <h3 className="journal-ribbon">Arma de combate</h3>
            <p className="text-xs text-[#795b3b] mb-3">Escolha a arma do espaço 3. O arco dispara à distância e compartilha o nível de melhoria da espada.</p>
            <div className="grid grid-cols-2 gap-2">
              {(["sword", "bow"] as CombatWeapon[]).map((weapon) => <button key={weapon} type="button" aria-pressed={snap.combatWeapon === weapon} onClick={() => props.onCombatWeapon(weapon)} className={`journal-slot flex items-center justify-center gap-2 p-2 ${snap.combatWeapon === weapon ? "selected" : ""}`}>
                <SpriteThumb name={`tool_${weapon}`} size={42} craftPix={props.craftPix} />
                <span className="text-left"><b className="font-display">{weapon === "bow" ? "Arco" : "Espada"}</b><small className="block text-[10px] opacity-65">{weapon === "bow" ? "Longo alcance" : "Corpo a corpo"}</small></span>
              </button>)}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-4">{EQUIPMENT.map((gear) => <article className="journal-page equipment-card" key={gear.id}><div className="flex justify-center"><SpriteThumb name={gear.sprite} size={64} /></div>
            <h4 className="font-display text-lg text-center">{gear.name}</h4><p className="text-[10px] leading-relaxed my-2 min-h-12 text-[#795b3b]">{gear.desc}</p>
            <span className="text-[10px] font-bold text-[#3d7759]">{gear.effect}</span>
            {snap.equipment[gear.id] ? <div className="mt-3 font-display text-[#3d7759] text-center">✓ Equipado</div> : <><div className="my-2"><Costs cost={gear.cost} inv={snap.inv} craftPix={props.craftPix} /></div><button className="journal-button small w-full" onClick={() => props.onCraftEquipment(gear.id)}>Fabricar & equipar</button></>}
          </article>)}</div>
        </main>
      </div>}

      {panel === "people" && <div className="p-3 sm:p-5">
        <p className="text-sm leading-relaxed text-[#795b3b] mb-4">Encontre os sinais <b>!</b> no mapa e afaste as criaturas para resgatar sobreviventes. Depois, converse para convidá-los: um profissional por encontro, começando no nível 1. Moradores comuns continuam desarmados.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {snap.specialists.map((person) => <article key={person.id} className="journal-page" aria-label={person.name}>
            <div className="flex justify-between gap-3 items-start"><div><h3 className="font-display text-xl">{person.name}</h3><p className="text-xs text-[#795b3b]">{person.role}</p></div><b className="text-xs text-[#447a58]">{person.hired ? `Nível ${person.level}` : person.rescued ? "A salvo" : "A resgatar"}</b></div>
            {!person.hired ? <p className="text-xs leading-relaxed mt-3">{person.rescued ? "Aproxime-se e use Interagir para convidar à equipe." : person.hint + ". Derrote as criaturas do encontro e depois converse."}</p> : <>
              <p className="text-xs font-bold mt-3 mb-1">Tarefa</p>
              <div role="group" aria-label={`Tarefa de ${person.name}`} className="flex flex-wrap gap-1.5">
                {(person.id === "miner" ? [["mine", "Minerar"], ["rest", "Descansar"]] : [["follow", "Acompanhar"], ["defend", "Defender base"], ["train", "Treinar"]]).map(([duty, label]) => <button key={duty} type="button" aria-pressed={person.duty === duty} className={`journal-button small ${person.duty === duty ? "" : "muted"}`} onClick={() => props.onSpecialistDuty(person.id, duty as SpecialistDuty)}>{label}</button>)}
              </div>
              {person.id === "miner" ? <p className="text-xs mt-3 leading-relaxed">Construa uma pedreira. Durante o dia e sem perigo próximo, o minerador produz ferro. Depois que você coletar cristal pela primeira vez, ele também encontra cristal.</p> : <>
                <p className="text-xs mt-3 leading-relaxed">Treino diurno na base, sem inimigos: <b>{Math.min(person.training, person.trainingTarget)}/{person.trainingTarget}s</b>. Feche o caderno para o tempo passar.</p>
                {person.weaponLevel < 3 && <div className="mt-2"><Costs cost={person.upgradeCost} inv={snap.inv} craftPix={props.craftPix} /></div>}
                <button type="button" className="journal-button small w-full mt-2" disabled={!!person.upgradeReason || !person.affordable} onClick={() => props.onSpecialistUpgrade(person.id)}>{person.upgradeReason || (person.affordable ? "Forjar próximo equipamento" : "Faltam materiais")}</button>
              </>}
            </>}
          </article>)}
        </div>
      </div>}

      {panel === "bestiary" && <div className="p-3 sm:p-5">
        <div className="flex gap-2 mb-4"><button className={`journal-button small ${bookTab === "creatures" ? "" : "muted"}`} onClick={() => setBookTab("creatures")}>Bestiário · {snap.seenCreatures.length}</button><button className={`journal-button small ${bookTab === "places" ? "" : "muted"}`} onClick={() => setBookTab("places")}>Atlas de ruínas · {snap.discoveredSites.length}/{SITES.length}</button></div>
        <div className="journal-book-grid">
          <aside className="journal-page">
            <h3 className="journal-ribbon">{bookTab === "creatures" ? "Criaturas" : "Destinos"}</h3>
            {bookTab === "creatures" ? creatures.map((entry,i) => <button className={`journal-row ${i === creatureIndex ? "active" : ""}`} key={entry.sprite} onClick={() => setCreatureIndex(i)}><SpriteThumb name={entry.sprite} size={32} craftPix={props.craftPix} /><span>{entry.name}<small>{snap.seenCreatures.includes(entry.sprite) ? `Registrado · ${snap.creatureKills[entry.sprite] ?? 0} abates` : "Ainda não avistado"}</small></span></button>) : SITES.map((entry,i) => <button className={`journal-row ${i === siteIndex ? "active" : ""}`} key={entry.id} onClick={() => setSiteIndex(i)}><span className="w-2 h-2 rounded-full shrink-0" style={{background:entry.color}} /><span>{entry.name}<small>{snap.claimedSites.includes(entry.id) ? "Suprimentos recolhidos" : snap.discoveredSites.includes(entry.id) ? "Descoberto" : "Por explorar"}</small></span></button>)}
          </aside>
          <main className="journal-page book-detail">
            {bookTab === "creatures" ? <>
              <span className="journal-eyebrow">{creature.category} · REGISTRO DE CAMPO</span><h3 className="font-display text-3xl mt-1">{creature.name}</h3>
              <div className="book-art"><SpriteThumb name={creature.sprite} size={160} craftPix={props.craftPix} /></div>
              <p className="text-sm text-[#775739] text-center">{creature.habitat}</p>
              <div className="grid grid-cols-3 gap-2 my-4 text-center">{[["VIDA",creature.hp],["DANO",creature.damage],["RITMO",creature.speed]].map(([label,value]) => <div key={label} className="journal-stat"><small>{label}</small><b>{value}</b></div>)}</div>
              <h4 className="font-display text-xl">{creature.attack}</h4><p className="text-sm leading-relaxed mt-2 text-[#775739]">{creature.tip}</p><p className="text-[10px] mt-5 opacity-55">Estatísticas-base. Dificuldade e dias sobrevividos aumentam a força das criaturas.</p>
            </> : <>
              <span className="journal-eyebrow">EXPEDIÇÃO · {snap.discoveredSites.includes(site.id) ? "LOCAL DESCOBERTO" : "RUMOR DA ILHA"}</span><h3 className="font-display text-3xl mt-1">{site.name}</h3>
              <div className="book-art"><SpriteThumb name={site.sprite} size={180} /></div><p className="font-display text-lg text-center">{site.subtitle}</p><p className="text-sm leading-relaxed mt-3 text-[#775739]">{site.lore}</p>
              <div className="mt-4 py-3 border-t border-[#ad8b5e]/40"><p className="font-display text-lg">Suprimentos do altar</p><Costs cost={site.reward} inv={snap.inv} craftPix={props.craftPix} /></div><p className="text-[11px] text-[#4c7e5c] mt-3">Local marcado no mapa (M). Aproxime-se da entrada e use E para investigar. A recompensa só pode ser recolhida uma vez.</p>
            </>}
          </main>
        </div>
      </div>}
      <footer className="journal-footer"><span>Dia {snap.day} · {snap.zone}</span><span>{snap.fps} FPS · {snap.discoveredSites.length} descobertas</span></footer>
    </section>
  </div>;
}

export function OutcomePanel({ won, snap, onRespawn, onRestart, onScores, onMenu }: {
  won: boolean; snap: Snapshot; onRespawn: () => void; onRestart: () => void; onScores: () => void; onMenu: () => void;
}) {
  return <div className="journal-backdrop" style={{zIndex:55}}>
    <section className="journal-frame outcome-card" role="dialog" aria-modal="true" aria-label={won ? "Vitória" : "Fim da partida"}>
      <div className="journal-heading"><span className="font-display text-lg">{GAME_TITLE.toUpperCase()}</span></div>
      <div className="p-7 sm:p-9 text-center">
        <div className="flex justify-center items-center gap-1 h-28 mb-3">
          {won ? [48,76,48].map((size,i) => <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l3.4 7 7.6 1.1-5.5 5.4 1.3 7.5-6.8-3.6-6.8 3.6 1.3-7.5L1 9.1 8.6 8z" fill={i===1?"#e7ad3f":"#c38d39"} stroke="#855124" strokeWidth="1.2"/><path d="M12 3l2.2 6-2.2 4-2.7-4z" fill="#f9d676"/></svg>) : <svg width="90" height="90" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l8 7 8-7 3 3-8 7 8 8-3 3-8-8-8 8-3-3 8-8-8-7z" fill="#526e8c" stroke="#33485e" strokeWidth="1.5"/></svg>}
        </div>
        <h2 className="font-display text-4xl">{won ? "Um novo amanhecer" : "Você caiu"}</h2>
        <p className="text-sm leading-relaxed text-[#80613e] mt-3">{won ? `Você e Rian escaparam depois de ${snap.day} dias. A cidade está no horizonte — a clareira viverá na memória.` : `Você caiu no dia ${snap.day}. Acordará ferido na base, com pouca vida e energia.`}</p>
        {!won && snap.recovery && <div className="journal-page text-left mt-4 text-sm leading-relaxed" aria-label="Consequências da queda">
          <p><b>Saque:</b> {snap.recovery.report.percent}% dos recursos comuns carregados. Ferro, cristal, ferramentas e equipamentos foram preservados.</p>
          <p className="mt-1"><b>Base:</b> {snap.recovery.report.destroyed} estruturas destruídas e {snap.recovery.report.damaged} danificadas.</p>
          <p className="text-xs mt-1 opacity-75">A dificuldade e a pressão da onda determinam os estragos.</p>
        </div>}
        <div className="font-display text-2xl my-5 text-[#78502d]">{snap.score.toLocaleString("pt-BR")} pontos</div>
        <div className="grid grid-cols-2 gap-3">
          {!won && snap.canRespawn ? <button className="journal-button col-span-2" onClick={onRespawn}>Renascer na fogueira</button> : null}
          <button className="journal-button" onClick={onRestart}>{won ? "Nova expedição" : "Tentar de novo"}</button>
          <button className="journal-button" onClick={onScores}>Ver placar</button>
        </div>
        <div className="mt-5 border-t border-[#b3935d]/40 pt-3 text-[11px] flex flex-wrap justify-center gap-x-4 gap-y-1 text-[#8d6b40]"><span>{snap.kills} abates</span><span>Reino nível {snap.baseLevel}</span><span>{snap.discoveredSites.length} ruínas descobertas</span></div>
        <button className="mt-4 text-xs text-[#8d6b40] underline cursor-pointer" onClick={onMenu}>Voltar ao menu</button>
      </div>
    </section>
  </div>;
}
