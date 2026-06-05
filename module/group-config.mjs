import {
  getGroupForms, getFormData, setFormData, removeFromGroup,
  createGroup, saveGroupOrder, dissolveGroup, isInGroup, getGroupId, getGroupName,
} from "./form-group.mjs";
import { resolveTokenImg } from "./resolve-img.mjs";
import { ActorBrowserApp } from "./actor-browser.mjs";

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
    position: { width: 460, height: "auto" },
    actions: {
      addActor: GroupConfigApp.#onAddActor,
      removeForm: GroupConfigApp.#onRemoveForm,
      setMain: GroupConfigApp.#onSetMain,
      dissolve: GroupConfigApp.#onDissolve,
      save: GroupConfigApp.#onSave,
    },
  };

  static PARTS = {
    config: { template: "modules/metamorph/templates/group-config.hbs" },
  };

  async _prepareContext() {
    const inGroup = isInGroup(this.#actor);
    const forms = inGroup ? getGroupForms(this.#actor) : [this.#actor];
    const hpMode = getFormData(this.#actor)?.hpMode ?? "independent";
    const groupName = inGroup ? getGroupName(this.#actor) : this.#actor.name;

    return {
      inGroup,
      hpMode,
      groupName,
      hpModes: [
        { value: "independent", label: "Independent" },
        { value: "absolute", label: "Carry over (absolute)" },
        { value: "percent", label: "Carry over (percent)" },
      ],
      forms: await Promise.all(forms.map(async a => {
        const fd = getFormData(a);
        return {
          actorId: a.id,
          label: fd?.label || a.name,
          img: await resolveTokenImg(a, "first"),
          isMain: fd?.isMain ?? false,
          order: fd?.order ?? 0,
        };
      })),
    };
  }

  static async #onAddActor() {
    const self = this;
    // Collect already-grouped actor ids to exclude them from the browser
    const excluded = new Set(
      isInGroup(self.#actor) ? getGroupForms(self.#actor).map(a => a.id) : [self.#actor.id]
    );

    const browser = new ActorBrowserApp(async (found) => {
      if (isInGroup(found)) {
        return ui.notifications.warn(`"${found.name}" is already in a Metamorph group.`);
      }
      if (!isInGroup(self.#actor)) {
        await createGroup([self.#actor, found]);
      } else {
        const forms = getGroupForms(self.#actor);
        await setFormData(found, {
          groupId: getGroupId(self.#actor),
          isMain: false,
          order: forms.length,
          label: found.name,
          hpMode: getFormData(self.#actor)?.hpMode,
          groupName: getGroupName(self.#actor),
        });
      }
      self.render();
    }, excluded);

    browser.render({ force: true });
  }

  static async #onRemoveForm(event, target) {
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const forms = getGroupForms(actor);
    if (forms.length <= 2) {
      await dissolveGroup(actor);
    } else {
      await removeFromGroup(actor);
      const remaining = getGroupForms(this.#actor);
      const mainId = remaining.find(a => getFormData(a)?.isMain)?.id ?? remaining[0].id;
      await saveGroupOrder(remaining, mainId);
    }
    this.render();
  }

  static async #onSetMain(event, target) {
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;
    const forms = getGroupForms(this.#actor);
    await saveGroupOrder(forms, actorId);
    this.render();
  }

  static async #onDissolve() {
    const confirmed = await Dialog.confirm({ title: "Dissolve Group", content: "Remove all form links?" });
    if (!confirmed) return;
    await dissolveGroup(this.#actor);
    this.close();
  }

  static async #onSave(event, target) {
    const hpMode = this.element.querySelector("[name=hpMode]")?.value ?? "independent";
    const groupName = this.element.querySelector("[name=groupName]")?.value?.trim() || undefined;
    const rows = this.element.querySelectorAll("[data-actor-id]");
    for (const row of rows) {
      const actor = game.actors.get(row.dataset.actorId);
      if (!actor) continue;
      const fd = getFormData(actor);
      const label = row.querySelector("[name=label]")?.value ?? fd.label;
      await setFormData(actor, { ...fd, label, hpMode, groupName });
    }
    this.close();
  }
}
