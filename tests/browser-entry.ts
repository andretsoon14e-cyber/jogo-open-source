// Standalone browser harness; it does not enter the production bundle.
export { Engine } from "../src/game/engine";
export { MusicManager } from "../src/game/music";
export { Terrain, collectBridgeRegions, drawWaterAnim } from "../src/game/terrain";
export { drawCharacter, getCharacterUrl, getSpriteUrl, viewFromAngle } from "../src/game/sprites";
export { craftPixStatus, drawCraftHero, drawCraftOrc, drawCraftPlant, drawCraftVillageHouse, drawCraftTower, hasCraftVillage, hasCraftTower, hasCraftOrcs, loadCraftPix } from "../src/game/craftpix";
export { drawReferenceFigure, drawReferenceCreature, hasReferenceCreature, referenceCreatureUrl, referenceArcherFrame, drawReferenceArcher, drawReferenceResident, drawReferenceDeposit, drawReferenceIcon, referenceIconUrl, drawReferenceObject, drawReferenceBridge, drawReferenceSpikes, referenceSpikeUrl, drawReferenceLightning, drawReferenceRipple, drawReferencePlant, hasReferenceArcher, hasReferenceObject, hasReferenceScene, referenceMenuUrl, loadReferenceArt } from "../src/game/reference-art";
