/**
 * Metamorph group data helpers.
 *
 * Main actor:  flags.metamorph.group = { groupName, hpMode }
 * Temp actors: flags.metamorph.temp  = { mainActorId, sourcePackId, sourceActorId }
 *
 * Temp actors live in world folder "Metamorph - <CharName>", imported on-demand
 * and deleted when the player changes form.
 */

const MODULE = "metamorph";

// ── Main actor ────────────────────────────────────────────────

export function getGroupData(actor) {
  return actor.getFlag(MODULE, "group") ?? null;
}

export function isInGroup(actor) {
  return !!getGroupData(actor) || !!getTempData(actor);
}

/** True only for the base/original actor (not temp morph actors). */
export function isMainForm(actor) {
  return !!getGroupData(actor) && !getTempData(actor);
}

/** Returns the main actor from any group member (main or temp). */
export function getMainActor(actor) {
  const temp = getTempData(actor);
  if (temp) return game.actors.get(temp.mainActorId) ?? null;
  return getGroupData(actor) ? actor : null;
}

export function getGroupName(actor) {
  const main = getMainActor(actor);
  return main ? (getGroupData(main)?.groupName ?? main.name) : actor.name;
}

export async function createGroup(actor, opts = {}) {
  await actor.setFlag(MODULE, "group", {
    groupName: opts.groupName ?? actor.name,
    hpMode:    opts.hpMode    ?? "independent",
  });
}

export async function setGroupData(actor, updates) {
  const current = getGroupData(actor) ?? {};
  await actor.setFlag(MODULE, "group", { ...current, ...updates });
}

export async function dissolveGroup(actor) {
  const main = getMainActor(actor);
  if (!main) return;
  for (const a of game.actors.filter(a => getTempData(a)?.mainActorId === main.id)) {
    await a.delete();
  }
  await main.unsetFlag(MODULE, "group");
}

// ── Temp actors ───────────────────────────────────────────────

export function getTempData(actor) {
  return actor.getFlag(MODULE, "temp") ?? null;
}

export function isTempActor(actor) {
  return !!getTempData(actor);
}
