import { getGroupData, getMainActor, getTempData, isTempActor, createGroup } from "./form-group.mjs";
import { resolveTokenImg } from "./resolve-img.mjs";

const MODULE = "metamorph";

// ── Core token swap ───────────────────────────────────────────

/**
 * Swap a canvas token to represent a different actor.
 * Copies prototype token appearance and transfers HP according to hpMode.
 */
export async function swapTokenForm(tokenDocument, targetActor) {
  try {
    const sourceActor = tokenDocument.actor;
    const proto = targetActor.prototypeToken;
    const textureSrc = await resolveTokenImg(targetActor, "random");

    const update = {
      actorId: targetActor.id,
      actorLink: proto.actorLink,
      name: proto.name,
      "texture.src": textureSrc,
      "texture.scaleX": tokenDocument.texture.scaleX,
      "texture.scaleY": tokenDocument.texture.scaleY,
      "texture.tint": proto.texture.tint,
      width: proto.width,
      height: proto.height,
      sight: proto.sight.toObject?.() ?? proto.sight,
      detectionModes: proto.detectionModes,
      light: proto.light.toObject?.() ?? proto.light,
      disposition: proto.disposition,
      displayName: proto.displayName,
      displayBars: proto.displayBars,
      bar1: proto.bar1.toObject?.() ?? proto.bar1,
      bar2: proto.bar2.toObject?.() ?? proto.bar2,
    };

    const sheetWasOpen = sourceActor.sheet?.rendered ?? false;
    if (sheetWasOpen) sourceActor.sheet.close();

    await _transferHp(sourceActor, targetActor);
    await tokenDocument.update(update);

    if (canvas.hud?.token?.object === tokenDocument.object) {
      canvas.hud.token.bind(tokenDocument.object);
    }
    if (sheetWasOpen) targetActor.sheet?.render(true);
  } catch (err) {
    console.error("Metamorph | swap failed:", err);
    ui.notifications.error("Metamorph: swap failed — check the console for details.");
  }
}

async function _transferHp(sourceActor, targetActor) {
  const mainActor = getMainActor(sourceActor) ?? sourceActor;
  const mode = getGroupData(mainActor)?.hpMode ?? "independent";
  if (mode === "independent") return;

  const srcHp = sourceActor.system?.attributes?.hp ?? sourceActor.system?.hp;
  const tgtHp = targetActor.system?.attributes?.hp  ?? targetActor.system?.hp;
  if (!srcHp || !tgtHp) return;

  let newValue;
  if (mode === "keep-original") {
    newValue = srcHp.value;
  } else if (mode === "absolute") {
    newValue = Math.clamp(srcHp.value, 0, tgtHp.max);
  } else {
    const pct = srcHp.max > 0 ? srcHp.value / srcHp.max : 1;
    newValue = Math.round(pct * tgtHp.max);
  }

  const hpPath = targetActor.system?.attributes?.hp !== undefined
    ? "system.attributes.hp.value"
    : "system.hp.value";

  await targetActor.update({ [hpPath]: newValue });
}

// ── On-demand import + folder management ──────────────────────

export async function getOrCreateMetamorphFolder(mainActor) {
  const folderName = `Metamorph - ${mainActor.name}`;
  return game.folders.find(f => f.type === "Actor" && f.name === folderName)
    ?? await Folder.create({ name: folderName, type: "Actor", color: "#4a1a6b" });
}

/**
 * Full swap operation (GM only — players use sockets).
 *
 * @param {object} opts
 * @param {string}      opts.sceneId
 * @param {string}      opts.tokenId
 * @param {string}      opts.mainActorId
 * @param {string|null} opts.packId          null = world actor / base form
 * @param {string}      opts.actorId         compendium entry id or world actor id
 * @param {string|null} opts.prevTempActorId actor to delete after swap
 */
export async function performSwap({ sceneId, tokenId, mainActorId, packId, actorId, prevTempActorId }) {
  const scene     = game.scenes.get(sceneId);
  const tokenDoc  = scene?.tokens.get(tokenId);
  const mainActor = game.actors.get(mainActorId);
  if (!scene || !tokenDoc || !mainActor) return;

  if (!getGroupData(mainActor)) {
    await createGroup(mainActor, { groupName: mainActor.name, hpMode: "independent" });
  }

  let targetActor;

  if (packId) {
    // Reuse already-imported temp actor if available
    const cached = game.actors.find(a => {
      const td = getTempData(a);
      return td?.mainActorId === mainActorId && td?.sourceActorId === actorId;
    });

    if (cached) {
      targetActor = cached;
    } else {
      const pack = game.packs.get(packId);
      if (!pack) { ui.notifications.error(`Metamorph: pack "${packId}" not found.`); return; }

      const folder = await getOrCreateMetamorphFolder(mainActor);
      targetActor  = await game.actors.importFromCompendium(pack, actorId, { folder: folder.id });
      await targetActor.setFlag(MODULE, "temp", {
        mainActorId,
        sourcePackId:  packId,
        sourceActorId: actorId,
      });
    }
  } else {
    // World actor (base form = mainActor, or manually-added world actor)
    targetActor = actorId === mainActorId ? mainActor : game.actors.get(actorId);
  }

  if (!targetActor) { ui.notifications.error("Metamorph: target actor not found."); return; }

  await swapTokenForm(tokenDoc, targetActor);

  // Delete the previous temp actor now that the token has moved on
  if (prevTempActorId && prevTempActorId !== actorId) {
    const prev = game.actors.get(prevTempActorId);
    if (prev && isTempActor(prev)) await prev.delete();
  }
}
