import {
  getFilterPresets, saveFilterPreset, deleteFilterPreset, queryFilter,
} from "./filter-presets.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FilterPresetApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string|null} "new" | preset-id | null (list view) */
  #editing = null;

  static DEFAULT_OPTIONS = {
    id: "metamorph-filter-presets",
    classes: ["metamorph-filter-presets"],
    tag: "div",
    window: { title: "Metamorph — Filter Presets", resizable: true },
    position: { width: 460, height: 500 },
    actions: {
      newPreset:       FilterPresetApp.#onNewPreset,
      editPreset:      FilterPresetApp.#onEditPreset,
      duplicatePreset: FilterPresetApp.#onDuplicatePreset,
      deletePreset:    FilterPresetApp.#onDeletePreset,
      savePreset:      FilterPresetApp.#onSavePreset,
      cancelEdit:      FilterPresetApp.#onCancelEdit,
      addRule:         FilterPresetApp.#onAddRule,
      removeRule:      FilterPresetApp.#onRemoveRule,
    },
  };

  static PARTS = {
    app: { template: "modules/metamorph/templates/filter-preset-app.hbs" },
  };

  async _prepareContext() {
    const allPacks = game.packs
      .filter(p => p.metadata.type === "Actor")
      .map(p => ({ id: p.collection, label: p.metadata.label }));

    if (this.#editing !== null) {
      const presets = getFilterPresets();
      const base = this.#editing === "new"
        ? { id: null, name: "", sources: ["world"], criteria: { actorTypes: [], rules: [] } }
        : (presets.find(p => p.id === this.#editing)
            ?? { id: null, name: "", sources: ["world"], criteria: { actorTypes: [], rules: [] } });

      const c = base.criteria ?? {};
      return {
        isEdit: true,
        preset: {
          ...base,
          criteria: {
            actorTypes: c.actorTypes ?? [],
            rules:      c.rules      ?? [],
          },
        },
        sourcesAvailable: [
          { id: "world", label: "World", checked: base.sources.includes("world") },
          ...allPacks.map(p => ({ ...p, checked: base.sources.includes(p.id) })),
        ],
        criteriaActorTypes: (c.actorTypes ?? []).join(", "),
      };
    }

    // List view — compute match counts
    const presets = getFilterPresets();
    const presetsWithCount = await Promise.all(
      presets.map(async p => {
        let count = 0;
        try { count = (await queryFilter(p)).length; } catch { /* ignore */ }
        return { ...p, count };
      })
    );

    return {
      isEdit: false,
      presets: presetsWithCount,
    };
  }

  // ── Actions ──────────────────────────────────────────────────

  static #onNewPreset() {
    this.#editing = "new";
    this.render();
  }

  static #onEditPreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    this.#editing = id;
    this.render();
  }

  static async #onDuplicatePreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    const original = getFilterPresets().find(p => p.id === id);
    if (!original) return;
    const copy = foundry.utils.deepClone(original);
    copy.id   = foundry.utils.randomID();
    copy.name = `${original.name} - copy`;
    await saveFilterPreset(copy);
    this.render();
  }

  static async #onDeletePreset(event, target) {
    const id = target.closest("[data-preset-id]")?.dataset.presetId;
    if (!id) return;
    const preset = getFilterPresets().find(p => p.id === id);
    if (!preset) return;
    const confirmed = await Dialog.confirm({
      title: "Delete Filter Preset",
      content: `<p>Delete "<strong>${preset.name}</strong>"?</p>`,
    });
    if (!confirmed) return;
    await deleteFilterPreset(id);
    this.render();
  }

  static async #onSavePreset() {
    const el = this.element;

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

    const preset = {
      id: this.#editing === "new" ? foundry.utils.randomID() : this.#editing,
      name,
      sources,
      criteria: { actorTypes, rules },
    };

    await saveFilterPreset(preset);
    this.#editing = null;
    this.render();
  }

  /** Open directly in new-preset edit mode. */
  static openNew() {
    const app = new FilterPresetApp();
    app.#editing = "new";
    return app.render({ force: true });
  }

  static #onCancelEdit() {
    this.#editing = null;
    this.render();
  }

  static #onAddRule() {
    const container = this.element?.querySelector(".mm-fp-rules");
    if (!container) return;
    const row = document.createElement("div");
    row.className = "mm-fp-rule";
    row.innerHTML = `
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
