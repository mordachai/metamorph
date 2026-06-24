import { getFilterPresets } from "./filter-presets.mjs";
import { getActorAssignments, getActorFilterIds, saveActorAssignment } from "./filter-presets.mjs";
import { getTempData } from "./form-group.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ActorAssignmentApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #selectedActorId = null;

  static DEFAULT_OPTIONS = {
    id: "metamorph-actor-assignment",
    classes: ["metamorph-actor-assignment"],
    tag: "div",
    window: { title: "Metamorph — Configure Access", resizable: true },
    position: { width: 600, height: 520 },
    actions: {
      selectActor: ActorAssignmentApp.#onSelectActor,
    },
  };

  static PARTS = {
    app: { template: "modules/metamorph/templates/actor-assignment-app.hbs" },
  };

  async _prepareContext() {
    const assignments = getActorAssignments();
    const actors = [...game.actors]
      .filter(a => !getTempData(a))
      .map(a => ({
        id: a.id,
        name: a.name,
        img: a.img || "icons/svg/mystery-man.svg",
        hasAssignments: (assignments[a.id]?.length ?? 0) > 0,
        selected: a.id === this.#selectedActorId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const allPresets = getFilterPresets();
    const selectedActor = this.#selectedActorId
      ? game.actors.get(this.#selectedActorId)
      : null;

    let filterPresets = [];
    if (selectedActor) {
      const assignedIds = new Set(assignments[this.#selectedActorId] ?? []);
      filterPresets = allPresets.map(p => ({
        id: p.id,
        name: p.name,
        assigned: assignedIds.has(p.id),
      }));
    }

    return {
      actors,
      selectedActor: selectedActor ? { id: selectedActor.id, name: selectedActor.name } : null,
      filterPresets,
      noPresets: allPresets.length === 0,
    };
  }

  _onRender(context, options) {
    for (const cb of this.element.querySelectorAll("input[type=checkbox][data-filter-id]")) {
      cb.addEventListener("change", async (e) => {
        if (!this.#selectedActorId) return;
        const filterId = e.target.dataset.filterId;
        if (!filterId) return;
        const current = new Set(getActorFilterIds(this.#selectedActorId));
        if (e.target.checked) current.add(filterId);
        else current.delete(filterId);
        await saveActorAssignment(this.#selectedActorId, [...current]);
        const actorEl = this.element?.querySelector(`[data-actor-id="${this.#selectedActorId}"]`);
        actorEl?.classList.toggle("has-assignments", current.size > 0);
      });
    }
  }

  static #onSelectActor(event, target) {
    const id = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!id) return;
    this.#selectedActorId = id;
    this.render();
  }
}
