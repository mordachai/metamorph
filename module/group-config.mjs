import {
  isInGroup, getGroupData, createGroup, setGroupData,
} from "./form-group.mjs";
import { FilterPresetApp } from "./filter-preset-app.mjs";
import { getFilterPresets, queryFilter } from "./filter-presets.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GroupConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor} */
  #actor;

  constructor(actor) {
    super();
    this.#actor = actor;
  }

  static DEFAULT_OPTIONS = {
    id: "metamorph-config",
    classes: ["metamorph-config"],
    tag: "div",
    window: { title: "Metamorph — Form Group", resizable: true },
    position: { width: 460, height: 560 },
    actions: {
      toggleSection:    GroupConfigApp.#onToggleSection,
      toggleAllSections:GroupConfigApp.#onToggleAllSections,
      newPreset:        GroupConfigApp.#onNewPreset,
      managePresets:    GroupConfigApp.#onManagePresets,
      save:             GroupConfigApp.#onSave,
    },
  };

  static PARTS = {
    config: { template: "modules/metamorph/templates/group-config.hbs" },
  };

  async _prepareContext() {
    const groupData = getGroupData(this.#actor) ?? {};
    const hpMode    = groupData.hpMode    ?? "independent";
    const groupName = groupData.groupName ?? this.#actor.name;

    const allPresets = getFilterPresets();
    const sections = await Promise.all(
      allPresets.map(async (preset) => {
        let actors = [];
        try { actors = await queryFilter(preset); } catch { /* ignore */ }
        return {
          filterId:   preset.id,
          filterName: preset.name,
          actors:     actors.map(a => ({
            actorId: a.actorId,
            packId:  a.packId ?? null,
            label:   a.name,
            img:     a.img || "icons/svg/mystery-man.svg",
          })),
        };
      })
    );

    return {
      hpMode,
      groupName,
      mainActor: {
        id:   this.#actor.id,
        name: this.#actor.name,
        img:  this.#actor.img,
      },
      sections,
      hpModes: [
        { value: "independent",   label: "Independent" },
        { value: "keep-original", label: "Keep original HP" },
        { value: "absolute",      label: "Carry over (absolute)" },
        { value: "percent",       label: "Carry over (percent)" },
      ],
    };
  }

  // ── Actions ──────────────────────────────────────────────────

  /** Accordion toggle — pure DOM, no re-render. */
  static #onToggleSection(event, target) {
    target.closest(".mm-section")?.classList.toggle("open");
  }

  static #onToggleAllSections(event, target) {
    const sections = [...this.element.querySelectorAll(".mm-section")];
    const anyNotOpen = sections.some(s => !s.classList.contains("open"));
    for (const s of sections) s.classList.toggle("open", anyNotOpen);
    const icon = target.querySelector("i");
    if (icon) {
      icon.className = anyNotOpen ? "fa-solid fa-angles-up" : "fa-solid fa-angles-down";
    }
  }

  static #onNewPreset() {
    FilterPresetApp.openNew();
  }

  static #onManagePresets() {
    new FilterPresetApp().render({ force: true });
  }

  static async #onSave() {
    const hpMode    = this.element.querySelector("[name=hpMode]")?.value ?? "independent";
    const groupName = this.element.querySelector("[name=groupName]")?.value?.trim() || this.#actor.name;
    if (isInGroup(this.#actor)) await setGroupData(this.#actor, { hpMode, groupName });
    else await createGroup(this.#actor, { groupName, hpMode });
    this.close();
  }
}
