import { getGroupData, getMainActor, getTempData, isTempActor, createGroup, getMainActorFromToken } from "./form-group.mjs";
import { resolveTokenImg } from "./resolve-img.mjs";

const MODULE = "metamorph";

// ── Core token swap ───────────────────────────────────────────

/**
 * Swap a canvas token to represent a different actor.
 * Copies prototype token appearance and transfers HP according to hpMode.
 */
export async function swapTokenForm(tokenDocument, targetActor, { hpMode, isRevert = false } = {}) {
  try {
    const sourceActor = tokenDocument.actor;

    // Cancelable pre-hook for other modules (return false to abort the swap).
    if (Hooks.call("metamorph.preMorph", tokenDocument, targetActor, sourceActor) === false) return;

    const proto = targetActor.prototypeToken;
    const textureSrc = await resolveTokenImg(targetActor, "random");

    // Warm the texture cache before swapping. Otherwise `refreshToken` can fire
    // while the token mesh still holds the previous form's (decoded) image, and
    // third-party art modules that read/crop `mesh.texture` on refresh will cache
    // the stale art under the new src — snapping the token back to the old image.
    // Preloading makes the new texture available synchronously on the redraw.
    try {
      const loadTex = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
      if (loadTex && textureSrc) await loadTex(textureSrc);
    } catch (err) {
      console.warn("Metamorph | texture preload failed:", err);
    }

    // The preload above only warms THIS client (the GM running the swap). Remote
    // clients (the player whose token is morphing) receive a plain token update
    // and redraw before the new texture is decoded — flashing/snapping back to the
    // old art until a manual refresh. Have every other active client preload the
    // texture FIRST, so their automatic redraw paints the correct art on pass one.
    if (textureSrc) {
      const others = game.users.filter(u => u.active && u.id !== game.user.id);
      if (others.length) {
        await Promise.allSettled(others.map(u =>
          u.query("metamorph.preloadTexture", { src: textureSrc }, { timeout: 10 * 1000 })
        ));
      }
    }

    // Serialize the full prototype — every field, every schema version, correctly typed.
    const update = foundry.utils.deepClone(proto.toObject());
    // Internal prototype-only fields that must not appear on a placed token update
    delete update._id;
    delete update.flags;
    delete update.randomImg;
    // Preserve the placed token's link state — copying the target prototype's
    // actorLink would flip a player token (link=true) to false (or vice-versa).
    // That transition re-derives appearance from the source actor's prototype,
    // causing the swapped art/size to "flash" back. Players stay linked, NPCs
    // stay unlinked, across both morph and revert.
    delete update.actorLink;
    // Override controlled fields
    update.actorId      = targetActor.id;
    update.texture.src  = textureSrc;

    const sheetWasOpen = sourceActor.sheet?.rendered ?? false;
    if (sheetWasOpen) sourceActor.sheet.close();

    await _transferHp(sourceActor, targetActor, hpMode);
    await tokenDocument.update(update);

    if (canvas.hud?.token?.object === tokenDocument.object) {
      canvas.hud.token.bind(tokenDocument.object);
    }
    if (sheetWasOpen) targetActor.sheet?.render(true);

    // Notify other modules the swap completed (animations, effects, logging).
    Hooks.callAll("metamorph.morph", tokenDocument, targetActor, sourceActor);
    if (isRevert) Hooks.callAll("metamorph.revert", tokenDocument, targetActor, sourceActor);
  } catch (err) {
    console.error("Metamorph | swap failed:", err);
    ui.notifications.error("Metamorph: swap failed — check the console for details.");
  }
}

async function _transferHp(sourceActor, targetActor, hpModeOverride) {
  const mainActor = getMainActor(sourceActor) ?? sourceActor;
  const mode = hpModeOverride ?? getGroupData(mainActor)?.hpMode ?? "independent";
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

async function getOrCreateMetamorphRootFolder() {
  return game.folders.find(f => f.type === "Actor" && f.name === "Metamorph" && !f.folder)
    ?? await Folder.create({ name: "Metamorph", type: "Actor", color: "#4a1a6b" });
}

export async function getOrCreateMetamorphFolder(mainActor) {
  const root = await getOrCreateMetamorphRootFolder();
  const folderName = `${mainActor.name} - morphs`;
  return game.folders.find(f => f.type === "Actor" && f.name === folderName && f.folder?.id === root.id)
    ?? await Folder.create({ name: folderName, type: "Actor", color: "#4a1a6b", folder: root.id });
}

/**
 * Resolve (or create) the private per-character copy of a form.
 *
 * Every non-base target — compendium entry or world actor — gets its own temp
 * actor cloned into the "Metamorph/<name> - morphs" folder, isolated per main
 * actor (so two characters morphing into the same source "Lion" don't share a
 * document). The clone's own name gets the "<Character> (<Form>)" treatment;
 * its prototype token name is forced back to the character's name so the
 * placed token never shows the form name. Reused across repeat swaps to the
 * same form until the character morphs elsewhere (see prevTempActorId below).
 */
async function getOrCreateTempForm(mainActor, { packId, actorId }) {
  const cached = game.actors.find(a => {
    const td = getTempData(a);
    return td?.mainActorId === mainActor.id
      && (td?.sourcePackId ?? null) === (packId ?? null)
      && td?.sourceActorId === actorId;
  });
  if (cached) return cached;

  const folder = await getOrCreateMetamorphFolder(mainActor);
  let created;

  if (packId) {
    const pack = game.packs.get(packId);
    if (!pack) { ui.notifications.error(`Metamorph: pack "${packId}" not found.`); return null; }
    created = await game.actors.importFromCompendium(pack, actorId, { folder: folder.id });
  } else {
    const source = game.actors.get(actorId);
    if (!source) return null;
    const data = source.toObject();
    delete data._id;
    data.folder = folder.id;
    created = await Actor.create(data);
  }

  // Mirror the main actor's ownership so whoever controls the base form keeps
  // control of the morphed form — otherwise a fresh clone lands with default
  // (GM-only) ownership and the player loses control of the token.
  await created.update({
    name:               `${mainActor.name} (${created.name})`,
    "prototypeToken.name": mainActor.name,
    ownership:          foundry.utils.deepClone(mainActor.ownership),
    [`flags.${MODULE}.temp`]: {
      mainActorId:   mainActor.id,
      sourcePackId:  packId ?? null,
      sourceActorId: actorId,
    },
  });

  return created;
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
 * @param {string|null} [opts.hpMode]         one-shot HP mode override for this swap
 */
export async function performSwap({ sceneId, tokenId, mainActorId, packId, actorId, prevTempActorId, hpMode }) {
  const scene     = game.scenes.get(sceneId);
  const tokenDoc  = scene?.tokens.get(tokenId);
  const mainActor = game.actors.get(mainActorId);
  if (!scene || !tokenDoc || !mainActor) return;

  if (!getGroupData(mainActor)) {
    await createGroup(mainActor, { groupName: mainActor.name, hpMode: "independent" });
  }

  const targetActor = (!packId && actorId === mainActorId)
    ? mainActor
    : await getOrCreateTempForm(mainActor, { packId, actorId });

  if (!targetActor) { ui.notifications.error("Metamorph: target actor not found."); return; }

  const isRevert = targetActor.id === mainActorId;
  await swapTokenForm(tokenDoc, targetActor, { hpMode, isRevert });

  // Track mainActorId on the token so the HUD button and picker work even if
  // the target actor somehow carries no temp flag of its own.
  if (targetActor.id === mainActorId) {
    await tokenDoc.unsetFlag(MODULE, "mainActorId");
  } else {
    await tokenDoc.setFlag(MODULE, "mainActorId", mainActorId);
  }

  // Delete the previous temp actor now that the token has moved on — but only if
  // no other placed token still uses it. During combat a player may morph several
  // forms before reverting; a shared/cached temp actor must survive until the last
  // token leaves it. (This token already updated its actorId above, so it won't match.)
  if (prevTempActorId && prevTempActorId !== targetActor.id) {
    const prev = game.actors.get(prevTempActorId);
    const stillInUse = game.scenes.some(s => s.tokens.some(t => t.actorId === prevTempActorId));
    if (prev && isTempActor(prev) && !stillInUse) await prev.delete();
  }
}

/**
 * Route a swap: GMs perform it directly, players delegate to the active GM
 * via a native query and await the real result. No third-party socket lib.
 *
 * @param {object} payload  performSwap payload
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function requestSwap(payload) {
  if (game.user.isGM) {
    await performSwap(payload);
    return { ok: true };
  }
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn("Metamorph: a GM must be online to change form.");
    return { ok: false, reason: "no-gm" };
  }
  try {
    const res = await gm.query("metamorph.performSwap", payload, { timeout: 30 * 1000 });
    if (!res?.ok) {
      ui.notifications.error(`Metamorph: form change failed${res?.reason ? ` (${res.reason})` : ""}.`);
    }
    return res ?? { ok: false, reason: "no-response" };
  } catch (err) {
    console.error("Metamorph | swap query failed:", err);
    ui.notifications.warn("Metamorph: form change timed out or failed.");
    return { ok: false, reason: "timeout" };
  }
}
