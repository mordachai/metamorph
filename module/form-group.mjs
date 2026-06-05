/**
 * Helpers for reading/writing Metamorph form-group flags on Actor documents.
 *
 * Flag shape (per actor):
 *   flags.metamorph = { groupId, isMain, order, label }
 */

const MODULE = "metamorph";

export function getFormData(actor) {
  return actor.getFlag(MODULE, "data") ?? null;
}

export function isInGroup(actor) {
  return !!getFormData(actor);
}

export function isMainForm(actor) {
  return getFormData(actor)?.isMain === true;
}

export function getGroupId(actor) {
  return getFormData(actor)?.groupId ?? null;
}

/** All actors in the same group, sorted by order. */
export function getGroupForms(actor) {
  const groupId = getGroupId(actor);
  if (!groupId) return [];
  return game.actors
    .filter(a => getGroupId(a) === groupId)
    .sort((a, b) => (getFormData(a)?.order ?? 0) - (getFormData(b)?.order ?? 0));
}

/** The main form actor for a group, given any member actor. */
export function getMainForm(actor) {
  return getGroupForms(actor).find(a => isMainForm(a)) ?? null;
}

export function getGroupName(actor) {
  return getFormData(actor)?.groupName ?? "";
}

export async function setFormData(actor, { groupId, isMain = false, order = 0, label = "", hpMode, groupName } = {}) {
  const data = { groupId, isMain, order, label: label || actor.name };
  if (hpMode !== undefined) data.hpMode = hpMode;
  if (groupName !== undefined) data.groupName = groupName;
  await actor.setFlag(MODULE, "data", data);
}

export async function removeFromGroup(actor) {
  await actor.unsetFlag(MODULE, "data");
}

/** Create a new group from an array of actors. First actor becomes main. */
export async function createGroup(actors) {
  const groupId = foundry.utils.randomID();
  const groupName = actors[0].name;
  for (let i = 0; i < actors.length; i++) {
    await setFormData(actors[i], {
      groupId,
      isMain: i === 0,
      order: i,
      label: actors[i].name,
      groupName,
    });
  }
  return groupId;
}

/** Rewrite order + isMain for all actors in a group from an ordered array. */
export async function saveGroupOrder(actors, mainActorId) {
  for (let i = 0; i < actors.length; i++) {
    const fd = getFormData(actors[i]);
    await setFormData(actors[i], {
      groupId: fd.groupId,
      isMain: actors[i].id === mainActorId,
      order: i,
      label: fd.label,
      hpMode: fd.hpMode,
      groupName: fd.groupName,
    });
  }
}

/** Dissolve an entire group, removing flags from all members. */
export async function dissolveGroup(actor) {
  const forms = getGroupForms(actor);
  for (const a of forms) await removeFromGroup(a);
}
