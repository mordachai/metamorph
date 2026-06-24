import {
  getFilterPresets, saveFilterPreset, deleteFilterPreset, queryFilter,
  getMorphGroups, saveMorphGroup, deleteMorphGroup,
  getActorGroupIds, saveActorGroupIds, actorHasAssignments,
} from "./filter-presets.mjs";
import { getGroupData, isInGroup, createGroup, setGroupData, getTempData } from "./form-group.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const HP_MODES = [
  { value: "independent",   label: "Independent"           },
  { value: "keep-original", label: "Keep original HP"      },
  { value: "absolute",      label: "Carry over (absolute)" },
  { value: "percent",       label: "Carry over (percent)"  },
];

const METAMORPH_FOLDER_RE = /^Metamorph\s*[-–]/i;

function actorEntry(actor, selectedId) {
  return {
    id:        actor.id,
    name:      actor.name,
    img:       actor.img || "icons/svg/mystery-man.svg",
    hasGroups: actorHasAssignments(actor.id),
    selected:  actor.id === selectedId,
  };
}

function getTopFolder(actor, folderMap) {
  let folder = actor.folder;
  if (!folder) return null;
  while (folder.folder?.id) folder = folderMap.get(folder.folder.id) ?? folder;
  return folder;
}

export class MetamorphConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #activeTab = "actors";
  #selectedActorId = null;
  #editingPresetId = null;   // null | "new" | preset-id  (filters tab editor)
  #pendingGroupId = null;    // group to auto-add after saving a new filter
  #openGroupIds = new Set(); // accordion open state

  static DEFAULT_OPTIONS = {
    id: "metamorph-configuration",
    classes: ["metamorph-configuration"],
    tag: "div",
    window: { title: "Metamorph — Configuration", resizable: true },
    position: { width: 820, height: 620 },
    actions: {
      selectActor:           MetamorphConfigApp.#onSelectActor,
      toggleFolder:          MetamorphConfigApp.#onToggleFolder,
      switchTab:             MetamorphConfigApp.#onSwitchTab,
      // Groups tab
      addGroup:              MetamorphConfigApp.#onAddGroup,
      removeGroup:           MetamorphConfigApp.#onRemoveGroup,
      toggleGroup:           MetamorphConfigApp.#onToggleGroup,
      removeFilterFromGroup: MetamorphConfigApp.#onRemoveFilterFromGroup,
      newFilterForGroup:     MetamorphConfigApp.#onNewFilterForGroup,
      // Filters tab
      newPreset:             MetamorphConfigApp.#onNewPreset,
      editPreset:            MetamorphConfigApp.#onEditPreset,
      duplicatePreset:       MetamorphConfigApp.#onDuplicatePreset,
      deletePreset:          MetamorphConfigApp.#onDeletePreset,
      savePreset:            MetamorphConfigApp.#onSavePreset,
      cancelEdit:            MetamorphConfigApp.#onCancelEdit,
      addRule:               MetamorphConfigApp.#onAddRule,
      removeRule:            MetamorphConfigApp.#onRemoveRule,
    },
  };

  static PARTS = {
    app: { template: "modules/metamorph/templates/metamorph-config-app.hbs" },
  };

  static openForActor(actorId) {
    const inst = new MetamorphConfigApp();
    inst.#selectedActorId = actorId;
    return inst.render({ force: true });
  }

  async _prepareContext() {
    // ── Left panel: actor folder tree ─────────────────────────
    const folderMap = new Map(
      [...game.folders]
        .filter(f => f.type === "Actor" && !METAMORPH_FOLDER_RE.test(f.name))
        .map(f => [f.id, f])
    );
    const allActors = [...game.actors].filter(a => !getTempData(a));

    const folderActors = new Map();
    const ungroupedActors = [];
    for (const actor of allActors) {
      const top = getTopFolder(actor, folderMap);
      if (top && folderMap.has(top.id)) {
        if (!folderActors.has(top.id)) folderActors.set(top.id, []);
        folderActors.get(top.id).push(actor);
      } else {
        ungroupedActors.push(actor);
      }
    }

    const folders = [...folderMap.values()]
      .filter(f => !f.folder && folderActors.has(f.id))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(f => ({
        id:     f.id,
        name:   f.name,
        actors: folderActors.get(f.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(a => actorEntry(a, this.#selectedActorId)),
      }));

    const ungrouped = ungroupedActors
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => actorEntry(a, this.#selectedActorId));

    // ── Shared preset data (used by both Groups and Filters tab) ─
    const allPresetsRaw = getFilterPresets();
    const allPresets = await Promise.all(
      allPresetsRaw.map(async p => {
        let count = 0;
        try { count = (await queryFilter(p)).length; } catch { /* ignore */ }
        return { ...p, count };
      })
    );

    // ── Actors tab ─────────────────────────────────────────────
    const selectedActor = this.#selectedActorId
      ? game.actors.get(this.#selectedActorId)
      : null;

    let actorPanel = null;
    if (selectedActor) {
      const actorGroupIds = getActorGroupIds(selectedActor.id);
      const groupData     = getGroupData(selectedActor);
      actorPanel = {
        actorId:   selectedActor.id,
        actorName: selectedActor.name,
        hpMode:    groupData?.hpMode ?? "independent",
        hpModes:   HP_MODES,
        groups: getMorphGroups().map(g => ({
          id:       g.id,
          name:     g.name,
          assigned: actorGroupIds.includes(g.id),
        })),
      };
    }

    // ── Groups tab ──────────────────────────────────────────────
    const morphGroups = getMorphGroups().map(g => {
      const assignedIds = g.presetIds ?? [];
      const presets = assignedIds
        .map(pid => allPresets.find(p => p.id === pid))
        .filter(Boolean);
      const availablePresets = allPresets.filter(p => !assignedIds.includes(p.id));
      return {
        id:               g.id,
        name:             g.name,
        open:             this.#openGroupIds.has(g.id),
        presets,
        availablePresets,
      };
    });

    // ── Filters tab ─────────────────────────────────────────────
    let editingPreset = null;
    if (this.#editingPresetId !== null) {
      const raw = this.#editingPresetId === "new"
        ? { id: null, name: "", sources: ["world"], criteria: { actorTypes: [], rules: [] } }
        : (allPresetsRaw.find(p => p.id === this.#editingPresetId)
            ?? { id: null, name: "", sources: ["world"], criteria: { actorTypes: [], rules: [] } });
      const c = raw.criteria ?? {};
      const allPacks = game.packs
        .filter(p => p.metadata.type === "Actor")
        .map(p => ({ id: p.collection, label: p.metadata.label }));
      editingPreset = {
        ...raw,
        criteria:           { actorTypes: c.actorTypes ?? [], rules: c.rules ?? [] },
        criteriaActorTypes: (c.actorTypes ?? []).join(", "),
        sourcesAvailable: [
          { id: "world", label: "World", checked: (raw.sources ?? []).includes("world") },
          ...allPacks.map(p => ({ ...p, checked: (raw.sources ?? []).includes(p.id) })),
        ],
      };
    }

    return {
      activeTab: this.#activeTab,
      folders,
      ungrouped,
      actorPanel,
      morphGroups,
      allPresets,
      editingPreset,
    };
  }

  _onRender(_context, _options) {
    // Actor group checkboxes (Actors tab)
    for (const cb of this.element.querySelectorAll("input.mm-cfg-actor-group-cb[data-group-id]")) {
      cb.addEventListener("change", async (e) => {
        const { groupId } = e.target.dataset;
        if (!this.#selectedActorId || !groupId) return;
        const ids = getActorGroupIds(this.#selectedActorId);
        const newIds = e.target.checked
          ? [...new Set([...ids, groupId])]
          : ids.filter(id => id !== groupId);
        await saveActorGroupIds(this.#selectedActorId, newIds);
        this.element.querySelector(`[data-actor-id="${this.#selectedActorId}"]`)
          ?.classList.toggle("has-groups", newIds.length > 0);
      });
    }

    // HP mode (Actors tab)
    this.element.querySelector("select[name=hpMode]")
      ?.addEventListener("change", async (e) => this.#saveHpMode(e.target.value));

    // Group name rename on blur/Enter (Groups tab)
    for (const input of this.element.querySelectorAll("input.mm-cfg-group-name[data-group-id]")) {
      input.addEventListener("blur",    (e) => this.#renameGroup(e.target.dataset.groupId, e.target.value.trim()));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
    }

    // Add existing filter to group via select (Groups tab)
    for (const sel of this.element.querySelectorAll("select.mm-cfg-filter-select[data-group-id]")) {
      sel.addEventListener("change", async (e) => {
        const { groupId } = e.target.dataset;
        const presetId    = e.target.value;
        e.target.value    = "";
        if (!presetId || !groupId) return;
        const group = getMorphGroups().find(g => g.id === groupId);
        if (!group || (group.presetIds ?? []).includes(presetId)) return;
        group.presetIds = [...(group.presetIds ?? []), presetId];
        await saveMorphGroup(group);
        this.render();
      });
    }
  }

  // ── Internal helpers ──────────────────────────────────────────

  async #renameGroup(groupId, name) {
    if (!name) return;
    const group = getMorphGroups().find(g => g.id === groupId);
    if (!group || group.name === name) return;
    await saveMorphGroup({ ...group, name });
  }

  async #saveHpMode(hpMode) {
    if (!this.#selectedActorId) return;
    const actor = game.actors.get(this.#selectedActorId);
    if (!actor) return;
    if (isInGroup(actor)) await setGroupData(actor, { hpMode });
    else await createGroup(actor, { groupName: actor.name, hpMode });
  }

  // ── Tab ───────────────────────────────────────────────────────

  static #onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (!tab || tab === this.#activeTab) return;
    this.#activeTab      = tab;
    this.#editingPresetId = null;
    this.render();
  }

  // ── Actor tree ────────────────────────────────────────────────

  static #onSelectActor(event, target) {
    const id = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!id || id === this.#selectedActorId) return;
    this.#selectedActorId = id;
    this.#activeTab       = "actors";
    this.render();
  }

  static #onToggleFolder(event, target) {
    target.closest(".mm-cfg-folder")?.classList.toggle("open");
  }

  // ── Groups tab ────────────────────────────────────────────────

  static #onToggleGroup(event, target) {
    event.stopPropagation();
    const groupId = target.dataset.groupId;
    if (!groupId) return;
    if (this.#openGroupIds.has(groupId)) this.#openGroupIds.delete(groupId);
    else this.#openGroupIds.add(groupId);
    this.render();
  }

  static async #onAddGroup() {
    const group = { id: foundry.utils.randomID(), name: "New Group", presetIds: [] };
    await saveMorphGroup(group);
    this.#openGroupIds.add(group.id);
    this.#activeTab = "groups";
    this.render();
  }

  static async #onRemoveGroup(event, target) {
    const groupId = target.dataset.groupId;
    if (!groupId) return;
    const group = getMorphGroups().find(g => g.id === groupId);
    if (!group) return;
    const confirmed = await Dialog.confirm({
      title:   "Delete Morph Group",
      content: `<p>Delete "<strong>${group.name}</strong>"? Actors assigned to this group will lose access.</p>`,
    });
    if (!confirmed) return;
    await deleteMorphGroup(groupId);
    this.#openGroupIds.delete(groupId);
    this.render();
  }

  static async #onRemoveFilterFromGroup(event, target) {
    const groupId  = target.dataset.groupId;
    const presetId = target.dataset.presetId;
    if (!groupId || !presetId) return;
    const group = getMorphGroups().find(g => g.id === groupId);
    if (!group) return;
    group.presetIds = (group.presetIds ?? []).filter(id => id !== presetId);
    await saveMorphGroup(group);
    this.render();
  }

  static #onNewFilterForGroup(event, target) {
    const groupId = target.dataset.groupId;
    if (!groupId) return;
    this.#pendingGroupId  = groupId;
    this.#activeTab       = "filters";
    this.#editingPresetId = "new";
    this.render();
  }

  // ── Filters tab ───────────────────────────────────────────────

  static #onNewPreset() {
    this.#editingPresetId = "new";
    this.#pendingGroupId  = null;
    this.render();
  }

  static #onEditPreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    this.#editingPresetId = id;
    this.render();
  }

  static async #onDuplicatePreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    const original = getFilterPresets().find(p => p.id === id);
    if (!original) return;
    const copy  = foundry.utils.deepClone(original);
    copy.id     = foundry.utils.randomID();
    copy.name   = `${original.name} - copy`;
    await saveFilterPreset(copy);
    this.render();
  }

  static async #onDeletePreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    const preset = getFilterPresets().find(p => p.id === id);
    if (!preset) return;
    const confirmed = await Dialog.confirm({
      title:   "Delete Filter Preset",
      content: `<p>Delete "<strong>${preset.name}</strong>"? It will be removed from all groups.</p>`,
    });
    if (!confirmed) return;
    await deleteFilterPreset(id);
    this.render();
  }

  static async #onSavePreset() {
    const el   = this.element;
    const name = el.querySelector("[name=fp-name]")?.value?.trim();
    if (!name) return ui.notifications.warn("Preset needs a name.");

    const sources = [...el.querySelectorAll("input[name=fp-source]:checked")].map(i => i.value);
    if (!sources.length) return ui.notifications.warn("Select at least one source.");

    const actorTypes = (el.querySelector("[name=fp-actorTypes]")?.value ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);

    const rules = [...el.querySelectorAll(".mm-fp-rule")].map(row => ({
      path:  row.querySelector("[name=fp-rule-path]")?.value?.trim()  ?? "",
      value: row.querySelector("[name=fp-rule-value]")?.value?.trim() ?? "",
    })).filter(r => r.path);

    const presetId = this.#editingPresetId === "new"
      ? foundry.utils.randomID()
      : this.#editingPresetId;

    await saveFilterPreset({ id: presetId, name, sources, criteria: { actorTypes, rules } });

    if (this.#pendingGroupId) {
      const group = getMorphGroups().find(g => g.id === this.#pendingGroupId);
      if (group && !(group.presetIds ?? []).includes(presetId)) {
        group.presetIds = [...(group.presetIds ?? []), presetId];
        await saveMorphGroup(group);
      }
      this.#pendingGroupId = null;
    }

    this.#editingPresetId = null;
    this.render();
  }

  static #onCancelEdit() {
    const returnToGroups  = !!this.#pendingGroupId;
    this.#editingPresetId = null;
    this.#pendingGroupId  = null;
    if (returnToGroups) this.#activeTab = "groups";
    this.render();
  }

  static #onAddRule() {
    const container = this.element?.querySelector(".mm-fp-rules");
    if (!container) return;
    const row       = document.createElement("div");
    row.className   = "mm-fp-rule";
    row.innerHTML   = `
      <input type="text" name="fp-rule-path"  placeholder="system.details.cr" class="mm-fp-rule-path">
      <input type="text" name="fp-rule-value" placeholder="&lt;=2  or  beast"  class="mm-fp-rule-value">
      <button type="button" data-action="removeRule" title="Remove rule">
        <i class="fa-solid fa-xmark"></i>
      </button>`;
    container.appendChild(row);
    row.querySelector("[name=fp-rule-path]")?.focus();
  }

  static #onRemoveRule(event, target) {
    target.closest(".mm-fp-rule")?.remove();
  }
}
