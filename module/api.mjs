/**
 * Metamorph public API.
 *
 * Reachable three ways:
 *   game.modules.get("metamorph").api      // standard discovery
 *   globalThis.Metamorph                   // macro convenience
 *   import { morph } from ".../api.mjs"     // ESM
 *
 * All swap routing goes through requestSwap → GMs act directly, players
 * delegate to the active GM via a native query (no third-party socket lib).
 */

import { getMainActorFromToken, getTempData } from "./form-group.mjs";
import { requestSwap } from "./token-swap.mjs";
import {
  getFilterPresets, saveFilterPreset, deleteFilterPreset, queryFilter as _queryFilter,
  getMorphGroups, saveMorphGroup, deleteMorphGroup,
  getActorDirectSets, saveActorDirectSets, saveActorGroupIds, getActorGroupIds,
} from "./filter-presets.mjs";
import { MetamorphConfigApp } from "./metamorph-config-app.mjs";
import { FormPickerApp } from "./form-picker.mjs";

export const version = 1;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Argument normalizers ──────────────────────────────────────

/**
 * Accepts: TokenDocument | Token (placeable) | tokenId string | {sceneId, tokenId}
 * @returns {TokenDocument}
 */
export function resolveToken(token) {
  if (!token) throw new Error("Metamorph: a token is required");
  if (typeof token === "string") {
    const onCanvas = canvas?.scene?.tokens?.get(token);
    if (onCanvas) return onCanvas;
    for (const scene of game.scenes) {
      const t = scene.tokens.get(token);
      if (t) return t;
    }
    throw new Error(`Metamorph: token "${token}" not found`);
  }
  if (token.documentName === "Token") return token;                 // TokenDocument
  if (token.document?.documentName === "Token") return token.document; // placeable Token
  if (token.sceneId && token.tokenId) {
    const t = game.scenes.get(token.sceneId)?.tokens.get(token.tokenId);
    if (t) return t;
    throw new Error("Metamorph: token not found from { sceneId, tokenId }");
  }
  throw new Error("Metamorph: unrecognized token argument");
}

/**
 * Accepts: Actor | uuid string | actorId string | { actorId, packId? }
 * @returns {{ actorId: string, packId: string|null }}
 */
export function resolveTarget(target) {
  if (!target) throw new Error("Metamorph: a target is required");
  if (target.documentName === "Actor") {
    return { actorId: target.id, packId: target.pack ?? null };
  }
  if (typeof target === "string") {
    if (target.includes(".")) {
      const parts = target.split(".");
      if (parts[0] === "Actor") return { actorId: parts[1], packId: null };
      if (parts[0] === "Compendium") {
        // Compendium.scope.pack.Actor.id
        return { actorId: parts[parts.length - 1], packId: `${parts[1]}.${parts[2]}` };
      }
    }
    return { actorId: target, packId: null };
  }
  if (target.actorId) return { actorId: target.actorId, packId: target.packId ?? null };
  throw new Error("Metamorph: unrecognized target argument");
}

// ── Core operations ───────────────────────────────────────────

/**
 * Swap a token to represent another actor (world or compendium).
 * @param {*} token   see resolveToken
 * @param {*} target  see resolveTarget
 * @param {object} [opts]
 * @param {string} [opts.hpMode]  one-shot HP transfer override
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function morph(token, target, opts = {}) {
  const tokenDoc = resolveToken(token);
  if (!game.user.isGM && !tokenDoc.actor?.isOwner) {
    ui.notifications.warn("Metamorph: you don't own this token.");
    return { ok: false, reason: "not-owner" };
  }
  const { actorId, packId } = resolveTarget(target);
  const currentActor = tokenDoc.actor;
  const mainActor    = getMainActorFromToken(tokenDoc) ?? currentActor;
  const tempData     = getTempData(currentActor);

  return requestSwap({
    sceneId:         tokenDoc.parent.id,
    tokenId:         tokenDoc.id,
    mainActorId:     mainActor.id,
    packId,
    actorId,
    prevTempActorId: tempData ? currentActor.id : null,
    hpMode:          opts.hpMode ?? null,
  });
}

/** Revert a token to its base/original form. */
export async function revert(token, opts = {}) {
  const tokenDoc   = resolveToken(token);
  const mainActor  = getMainActorFromToken(tokenDoc) ?? tokenDoc.actor;
  return morph(tokenDoc, { actorId: mainActor.id, packId: null }, opts);
}

/** Current form descriptor for a token, or null. */
export function getForm(token) {
  const tokenDoc = resolveToken(token);
  const actor    = tokenDoc.actor;
  if (!actor) return null;
  const temp = getTempData(actor);
  const main = getMainActorFromToken(tokenDoc) ?? actor;
  return {
    actorId:     actor.id,
    packId:      temp?.sourcePackId ?? null,
    name:        actor.name,
    isBase:      actor.id === main.id,
    mainActorId: main.id,
  };
}

/** The original/base Actor behind a token (handles temp + swapped world actors). */
export function getMainActor(token) {
  return getMainActorFromToken(resolveToken(token));
}

// ── Filters ───────────────────────────────────────────────────

export const listFilters  = () => getFilterPresets();
export const getFilter    = (id) => getFilterPresets().find((p) => p.id === id) ?? null;
export const saveFilter   = (preset) => saveFilterPreset(preset);
export const deleteFilter = (id) => deleteFilterPreset(id);

/**
 * Run a filter and return matching actors.
 * @param {object|string} presetOrId  inline preset object OR saved preset id
 * @returns {Promise<Array<{actorId, packId, name, img, type}>>}
 */
export async function queryFilter(presetOrId) {
  const preset = typeof presetOrId === "string" ? getFilter(presetOrId) : presetOrId;
  if (!preset) return [];
  return _queryFilter(preset);
}

// ── Morph groups & actor assignment ───────────────────────────

export const listGroups       = () => getMorphGroups();
export const getGroup         = (id) => getMorphGroups().find((g) => g.id === id) ?? null;
export const saveGroup        = (group) => saveMorphGroup(group);
export const deleteGroup      = (id) => deleteMorphGroup(id);

export const getActorSets     = (actorId) => getActorDirectSets(actorId);
export const saveActorSets    = (actorId, sets) => saveActorDirectSets(actorId, sets);
export const assignGroups     = (actorId, groupIds) => saveActorGroupIds(actorId, groupIds);
export const getAssignedGroups = (actorId) => getActorGroupIds(actorId);

// ── Selection UI ──────────────────────────────────────────────

async function _resolveActorList({ filter, filterId, actors } = {}) {
  const out  = [];
  const seen = new Set();
  const add  = (a) => {
    const key = `${a.actorId}::${a.packId ?? ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(a); }
  };

  if (filter)   for (const a of await _queryFilter(filter)) add(a);
  if (filterId) {
    const p = getFilter(filterId);
    if (p) for (const a of await _queryFilter(p)) add(a);
  }
  if (Array.isArray(actors)) {
    for (const a of actors) {
      let { actorId, packId = null, name, img } = a;
      if (!name || !img) {
        const w = !packId ? game.actors.get(actorId) : null;
        name ??= w?.name ?? actorId;
        img  ??= w?.img  ?? "icons/svg/mystery-man.svg";
      }
      add({ actorId, packId, name, img: img || "icons/svg/mystery-man.svg" });
    }
  }
  return out;
}

function _pickGrid(title, actors) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };

    const cells = actors.map((a) => `
      <button type="button" class="mm-api-form" data-actor-id="${esc(a.actorId)}" data-pack-id="${esc(a.packId ?? "")}">
        <img src="${esc(a.img)}" alt="">
        <span>${esc(a.name)}</span>
      </button>`).join("");

    const dlg = new foundry.applications.api.DialogV2({
      window:  { title },
      classes: ["metamorph-api-picker"],
      content: `<div class="mm-api-grid">${cells}</div>`,
      buttons: [{ action: "cancel", label: "Cancel" }],
    });

    // Resolve null if the dialog is dismissed without a pick.
    const origClose = dlg.close.bind(dlg);
    dlg.close = (...args) => { finish(null); return origClose(...args); };

    dlg.render({ force: true }).then(() => {
      for (const btn of dlg.element.querySelectorAll(".mm-api-form")) {
        btn.addEventListener("click", () => {
          finish({ actorId: btn.dataset.actorId, packId: btn.dataset.packId || null });
          dlg.close();
        });
      }
    });
  });
}

/**
 * Open a portrait grid and resolve with the chosen target (no swap performed).
 * @param {*} token
 * @param {object} opts
 * @param {string}        [opts.title]
 * @param {object}        [opts.filter]    inline filter preset object
 * @param {string}        [opts.filterId]  saved filter preset id
 * @param {Array}         [opts.actors]    explicit [{actorId, packId?, name?, img?}]
 * @returns {Promise<{actorId, packId}|null>}
 */
export async function promptForm(token, { title = "Choose Form", filter, filterId, actors } = {}) {
  resolveToken(token); // validate early
  const list = await _resolveActorList({ filter, filterId, actors });
  if (!list.length) {
    ui.notifications.warn("Metamorph: no forms to choose from.");
    return null;
  }
  return _pickGrid(title, list);
}

/**
 * Prompt for a form, then morph the token into it. The spell-macro entry point.
 * @returns {Promise<{actorId, packId}|null>}  the chosen target, or null
 */
export async function polymorph(token, opts = {}) {
  const choice = await promptForm(token, opts);
  if (!choice) return null;
  const res = await morph(token, choice, { hpMode: opts.hpMode });
  return res?.ok ? choice : null;
}

/** Alias — open a standalone selector menu (prompt + morph). */
export const openMenu = polymorph;

/** Open the HUD-style picker anchored to an element (uses saved assignments). */
export function openPicker(token, anchorEl) {
  return FormPickerApp.toggle(resolveToken(token), anchorEl);
}

// ── Config app ────────────────────────────────────────────────

export const openConfig         = () => new MetamorphConfigApp().render({ force: true });
export const openConfigForActor = (actorId) => MetamorphConfigApp.openForActor(actorId);
