import { getFormData } from "./form-group.mjs";
import { resolveTokenImg } from "./resolve-img.mjs";

/**
 * Swap a canvas token to represent a different actor.
 * Preserves position, rotation, elevation. Copies prototype token appearance.
 */
export async function swapTokenForm(tokenDocument, targetActor) {
  try {
    const sourceActor = tokenDocument.actor;
    const proto = targetActor.prototypeToken;

    // Resolve wildcard texture to a real path (picks randomly, matching wildcard-module behaviour).
    const textureSrc = await resolveTokenImg(targetActor, "random");

    const update = {
      actorId: targetActor.id,
      actorLink: proto.actorLink,
      name: proto.name,
      "texture.src": textureSrc,
      "texture.scaleX": proto.texture.scaleX,
      "texture.scaleY": proto.texture.scaleY,
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

    await _transferHp(tokenDocument, sourceActor, targetActor);
    await tokenDocument.update(update);
  } catch (err) {
    console.error("Metamorph | swap failed:", err);
    ui.notifications.error("Metamorph: swap failed — check the console for details.");
  }
}

async function _transferHp(tokenDocument, sourceActor, targetActor) {
  const groupData = getFormData(sourceActor);
  const mode = groupData?.hpMode ?? "independent";
  if (mode === "independent") return;

  const srcHp = sourceActor.system?.attributes?.hp ?? sourceActor.system?.hp;
  const tgtHp = targetActor.system?.attributes?.hp ?? targetActor.system?.hp;
  if (!srcHp || !tgtHp) return;

  let newValue;
  if (mode === "absolute") {
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
