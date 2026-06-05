import { getGroupForms, getFormData } from "./form-group.mjs";
import { swapTokenForm } from "./token-swap.mjs";
import { resolveTokenImg } from "./resolve-img.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FormPickerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {TokenDocument} */
  #tokenDoc;
  /** @type {HTMLElement} Button that opened the picker, used for positioning. */
  #anchorEl;
  #abort = null;

  /** Singleton: only one picker open at a time. */
  static #instance = null;

  /**
   * Toggle the picker for a given token. Closes if already open for the same token,
   * re-targets if a different token, opens fresh otherwise.
   * @param {TokenDocument} tokenDoc
   * @param {HTMLElement} anchorEl
   */
  static toggle(tokenDoc, anchorEl) {
    const inst = FormPickerApp.#instance;
    if (inst?.rendered) {
      if (inst.#tokenDoc === tokenDoc) { inst.close(); return; }
      inst.close();
    }
    FormPickerApp.#instance = new FormPickerApp(tokenDoc, anchorEl);
    FormPickerApp.#instance.render({ force: true }).catch(err => {
      console.error("Metamorph | FormPickerApp render failed:", err);
      ui.notifications.error("Metamorph: failed to open form picker.");
    });
  }

  constructor(tokenDoc, anchorEl) {
    super();
    this.#tokenDoc = tokenDoc;
    this.#anchorEl = anchorEl;
  }

  static DEFAULT_OPTIONS = {
    id: "metamorph-picker",
    classes: ["metamorph-picker"],
    tag: "div",
    window: { frame: false, positioned: true },
    position: { width: "auto", height: "auto" },
    actions: {
      pickForm: FormPickerApp.#onPickForm,
    },
  };

  static PARTS = {
    picker: { template: "modules/metamorph/templates/form-picker.hbs" },
  };

  async _prepareContext() {
    const actor = this.#tokenDoc.actor;
    const forms = getGroupForms(actor);
    const imgs = await Promise.all(forms.map(a => resolveTokenImg(a, "first")));
    return {
      forms: forms.map((a, i) => ({
        actorId: a.id,
        label: getFormData(a)?.label || a.name,
        img: imgs[i],
        active: a.id === actor.id,
      })),
    };
  }

  _onRender(context, options) {
    this.#abort?.abort();
    this.#abort = new AbortController();

    // Position near the anchor button
    this._positionNearAnchor();

    // Close on outside click
    document.addEventListener("pointerdown", (e) => {
      if (!this.element?.contains(e.target)) this.close();
    }, { signal: this.#abort.signal, capture: true });
  }

  async close(options) {
    this.#abort?.abort();
    this.#abort = null;
    return super.close({ ...options, animate: false });
  }

  _positionNearAnchor() {
    if (!this.#anchorEl || !this.element) return;
    const r = this.#anchorEl.getBoundingClientRect();
    // Measure from the inner element to avoid Foundry's broken double-auto-size
    // interaction (width:"auto" + height:"auto" in _updatePosition captures the
    // container's max-height instead of the natural content height).
    const inner = this.element.querySelector(".metamorph-picker-inner");
    const pad = 12; // 2 × 6px padding on #metamorph-picker
    const elH = Math.round((inner?.getBoundingClientRect().height ?? 0) + pad);
    const elW = Math.round((inner?.getBoundingClientRect().width  ?? 0) + pad);
    const left = Math.round(r.right + 8);
    const top  = Math.round(r.top + r.height / 2 - elH / 2);
    this.setPosition({ left, top, width: elW, height: elH });
  }

  static async #onPickForm(event, target) {
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;
    const targetActor = game.actors.get(actorId);
    if (!targetActor) return;
    this.close();
    await swapTokenForm(this.#tokenDoc, targetActor);
  }
}
