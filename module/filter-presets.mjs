const MODULE = "metamorph";

// ── Filter preset helpers ─────────────────────────────────────

export function getFilterPresets() {
  return game.settings.get(MODULE, "filterPresets") ?? [];
}

export async function saveFilterPreset(preset) {
  const presets = getFilterPresets().filter(p => p.id !== preset.id);
  presets.push(preset);
  await game.settings.set(MODULE, "filterPresets", presets);
}

export async function deleteFilterPreset(id) {
  await game.settings.set(MODULE, "filterPresets", getFilterPresets().filter(p => p.id !== id));
  // Remove from all morph groups
  const updated = getMorphGroups().map(g => ({
    ...g,
    presetIds: (g.presetIds ?? []).filter(pid => pid !== id),
  }));
  await game.settings.set(MODULE, "morphGroups", updated);
}

// ── Morph group helpers (global, reusable across actors) ───────
//
// morphGroups shape:
//   [{ id: string, name: string, presetIds: string[] }]

export function getMorphGroups() {
  return game.settings.get(MODULE, "morphGroups") ?? [];
}

export async function saveMorphGroup(group) {
  const groups = getMorphGroups().filter(g => g.id !== group.id);
  groups.push(group);
  await game.settings.set(MODULE, "morphGroups", groups);
}

export async function deleteMorphGroup(id) {
  await game.settings.set(MODULE, "morphGroups", getMorphGroups().filter(g => g.id !== id));
  // Remove from all actor assignments
  const assignments = foundry.utils.deepClone(getActorAssignments());
  let changed = false;
  for (const [actorId, groupIds] of Object.entries(assignments)) {
    if (!Array.isArray(groupIds)) continue;
    const next = groupIds.filter(gid => gid !== id);
    if (next.length !== groupIds.length) {
      changed = true;
      if (next.length) assignments[actorId] = next;
      else delete assignments[actorId];
    }
  }
  if (changed) await game.settings.set(MODULE, "actorAssignments", assignments);
}

// ── Actor assignment helpers ──────────────────────────────────
//
// actorAssignments shape:
//   { [actorId]: string[] }  — array of morph group IDs

function getActorAssignments() {
  return game.settings.get(MODULE, "actorAssignments") ?? {};
}

export function getActorGroupIds(actorId) {
  const val = getActorAssignments()[actorId];
  if (!Array.isArray(val)) return [];
  return val.filter(x => typeof x === "string");
}

/** Returns full morph group objects for an actor. Used by form-picker. */
export function getActorGroups(actorId) {
  const ids = getActorGroupIds(actorId);
  const all = getMorphGroups();
  return ids.map(id => all.find(g => g.id === id)).filter(Boolean);
}

export function actorHasAssignments(actorId) {
  if (getActorGroups(actorId).some(g => (g.presetIds?.length ?? 0) > 0)) return true;
  return getActorDirectSets(actorId).some(s => (s.actors?.length ?? 0) > 0);
}

// ── Actor direct sets ─────────────────────────────────────────
//
// actorDirectSets shape:
//   { [actorId]: [{ id: string, name: string, actors: [{actorId, packId?, name, img}] }] }

function getAllDirectSets() {
  return game.settings.get(MODULE, "actorDirectSets") ?? {};
}

export function getActorDirectSets(actorId) {
  return getAllDirectSets()[actorId] ?? [];
}

export async function saveActorDirectSets(actorId, sets) {
  const all = foundry.utils.deepClone(getAllDirectSets());
  if (sets?.length) all[actorId] = sets;
  else delete all[actorId];
  await game.settings.set(MODULE, "actorDirectSets", all);
}

export async function saveActorGroupIds(actorId, groupIds) {
  const assignments = foundry.utils.deepClone(getActorAssignments());
  if (groupIds?.length) assignments[actorId] = groupIds;
  else delete assignments[actorId];
  await game.settings.set(MODULE, "actorAssignments", assignments);
}

// ── Migration ─────────────────────────────────────────────────
//
// Old actorAssignments shape: { [actorId]: [{ id, name, presetIds }] }
// New shape:                  { [actorId]: string[] }  (morph group IDs)
//
// Creates shared morphGroups from the old per-actor group objects,
// deduplicating by name + preset set so two actors with identical
// "Beasts" groups share one global group.

export async function migrateActorAssignments() {
  const assignments = game.settings.get(MODULE, "actorAssignments") ?? {};

  const hasOldShape = Object.values(assignments).some(
    v => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null
  );
  if (!hasOldShape) return;

  const newGroups = [];
  const newAssignments = {};

  for (const [actorId, groups] of Object.entries(assignments)) {
    if (!Array.isArray(groups)) continue;
    newAssignments[actorId] = [];
    for (const g of groups) {
      if (typeof g !== "object" || !g) continue;
      const sortedKey = [...(g.presetIds ?? [])].sort().join(",");
      let existing = newGroups.find(
        ng => ng.name === g.name && [...ng.presetIds].sort().join(",") === sortedKey
      );
      if (!existing) {
        existing = {
          id:        g.id ?? foundry.utils.randomID(),
          name:      g.name ?? "Group",
          presetIds: g.presetIds ?? [],
        };
        newGroups.push(existing);
      }
      if (!newAssignments[actorId].includes(existing.id)) {
        newAssignments[actorId].push(existing.id);
      }
    }
    if (!newAssignments[actorId].length) delete newAssignments[actorId];
  }

  await game.settings.set(MODULE, "morphGroups", newGroups);
  await game.settings.set(MODULE, "actorAssignments", newAssignments);
  console.log("Metamorph | Migrated actor assignments to shared morph groups");
}

// ── Query engine ──────────────────────────────────────────────

function getNestedPath(obj, path) {
  return path.split(".").reduce((cur, key) => cur?.[key], obj);
}

function matchRule(entry, { path, value }) {
  const actual = getNestedPath(entry, path);
  if (actual === undefined || actual === null) return false;

  const v = String(value ?? "").trim();
  if (!v) return true;

  if      (v.startsWith("<=")) return Number(actual) <= Number(v.slice(2));
  else if (v.startsWith(">=")) return Number(actual) >= Number(v.slice(2));
  else if (v.startsWith("<"))  return Number(actual) <  Number(v.slice(1));
  else if (v.startsWith(">"))  return Number(actual) >  Number(v.slice(1));

  return String(actual).toLowerCase() === v.toLowerCase();
}

function matchesCriteria(entry, criteria) {
  const { actorTypes, rules } = criteria ?? {};
  if (actorTypes?.length && !actorTypes.includes(entry.type)) return false;
  for (const rule of rules ?? []) {
    if (rule.path && !matchRule(entry, rule)) return false;
  }
  return true;
}

function indexFieldsForPreset(preset) {
  const base = ["name", "img", "type", "folder"];
  const rulePaths = (preset.criteria?.rules ?? []).map(r => r.path).filter(Boolean);
  return [...new Set([...base, ...rulePaths])];
}

/**
 * Returns array of { actorId, packId?, name, img, type } matching the preset.
 */
export async function queryFilter(preset) {
  const results = [];
  const indexFields = indexFieldsForPreset(preset);

  for (const source of preset.sources ?? []) {
    if (source === "world") {
      for (const actor of game.actors) {
        if (matchesCriteria(actor, preset.criteria)) {
          results.push({ actorId: actor.id, name: actor.name, img: actor.img, type: actor.type });
        }
      }
    } else {
      const pack = game.packs.get(source);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: indexFields });
      for (const entry of index) {
        if (matchesCriteria(entry, preset.criteria)) {
          results.push({
            actorId: entry._id,
            packId:  source,
            name:    entry.name,
            img:     entry.img || "icons/svg/mystery-man.svg",
            type:    entry.type,
          });
        }
      }
    }
  }

  return results;
}
