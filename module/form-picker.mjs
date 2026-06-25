import { getMainActorFromToken, getTempData } from "./form-group.mjs";
import { getFilterPresets, getActorGroups, queryFilter, getActorDirectSets } from "./filter-presets.mjs";
import { performSwap } from "./token-swap.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FormPickerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {TokenDocument} */
  #tokenDoc;
  /** @type {HTMLElement} */
  #anchorEl;
  #abort = null;

  /** @type {"filters"|"actors"} */
  #view = "filters";
  /** @type {{filterId, filterName, actors[]}|null} */
  #activeFilter = null;
  /** @type {Array|null} cached sections so actor view doesn't need to re-query */
  #sections = null;

  static #instance = null;

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
      selectFilter: FormPickerApp.#onSelectFilter,
      back:         FormPickerApp.#onBack,
      pickForm:     FormPickerApp.#onPickForm,
    },
  };

  static PARTS = {
    picker: { template: "modules/metamorph/templates/form-picker.hbs" },
  };

  async _prepareContext() {
    const currentActor = this.#tokenDoc.actor;
    const tempData     = getTempData(currentActor);
    const curSrcId     = tempData?.sourceActorId ?? null;
    const curPackId    = tempData?.sourcePackId  ?? null;

    if (this.#view === "filters") {
      const mainActor   = getMainActorFromToken(this.#tokenDoc) ?? currentActor;
      const actorGroups = getActorGroups(mainActor.id);
      const directSets  = getActorDirectSets(mainActor.id);
      const allPresets  = getFilterPresets();

      // Filter-based group sections
      const groupSections = await Promise.all(
        actorGroups.map(async (g) => {
          const presets = allPresets.filter(p => (g.presetIds ?? []).includes(p.id));
          const seen    = new Set();
          const actors  = [];
          try {
            for (const p of presets) {
              for (const a of await queryFilter(p)) {
                const key = `${a.actorId}::${a.packId ?? ""}`;
                if (!seen.has(key)) { seen.add(key); actors.push(a); }
              }
            }
          } catch { /* ignore */ }
          return { filterId: g.id, filterName: g.name, count: actors.length, actors };
        })
      );

      // Direct actor set sections
      const directSections = directSets
        .filter(s => (s.actors?.length ?? 0) > 0)
        .map(s => ({
          filterId:   s.id,
          filterName: s.name,
          count:      s.actors.length,
          actors:     s.actors.map(a => ({
            actorId: a.actorId,
            packId:  a.packId ?? null,
            name:    a.name,
            img:     a.img || "icons/svg/mystery-man.svg",
          })),
        }));

      const sections = [...directSections, ...groupSections];
      this.#sections = sections;
      return {
        isFilterView: true,
        sections,
        baseActor: { actorId: mainActor.id, label: mainActor.name },
      };
    }

    // Actor grid view
    const actors = (this.#activeFilter?.actors ?? []).map(a => ({
      actorId: a.actorId,
      packId:  a.packId ?? null,
      label:   a.name,
      img:     a.img || "icons/svg/mystery-man.svg",
      active:  a.actorId === curSrcId && (a.packId ?? null) === curPackId,
      isBase:  false,
    }));

    return {
      isFilterView: false,
      filterName:   this.#activeFilter?.filterName ?? null,
      hasBack:      true,
      actors,
    };
  }

  _onRender(context, options) {
    this.#abort?.abort();
    this.#abort = new AbortController();
    this._positionNearAnchor();
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
    const r     = this.#anchorEl.getBoundingClientRect();
    const inner = this.element.querySelector(".metamorph-picker-inner");
    const pad   = 12;
    const elH   = Math.round((inner?.getBoundingClientRect().height ?? 0) + pad);
    const elW   = Math.round((inner?.getBoundingClientRect().width  ?? 0) + pad);
    this.setPosition({
      left:   Math.round(r.right + 8),
      top:    Math.round(r.top + r.height / 2 - elH / 2),
      width:  elW,
      height: elH,
    });
  }

  // ── Actions ──────────────────────────────────────────────────

  static #onSelectFilter(event, target) {
    const filterId = target.closest("[data-filter-id]")?.dataset.filterId;
    if (!filterId) return;
    const section = (this.#sections ?? []).find(s => s.filterId === filterId);
    if (!section) return;
    this.#activeFilter = section;
    this.#view = "actors";
    this.render();
  }

  static #onBack() {
    this.#view = "filters";
    this.#activeFilter = null;
    this.render();
  }

  static async #onPickForm(event, target) {
    const el      = target.closest("[data-actor-id]");
    const actorId = el?.dataset.actorId;
    const packId  = el?.dataset.packId || null;
    if (!actorId) return;

    const tokenDoc     = this.#tokenDoc;
    const currentActor = tokenDoc.actor;
    const mainActor    = getMainActorFromToken(tokenDoc) ?? currentActor;
    const tempData     = getTempData(currentActor);
    // If currently a temp actor, the temp actor itself is the "prev" to delete
    const prevTempActorId = tempData ? currentActor.id : null;

    this.close();

    const payload = {
      sceneId:         tokenDoc.parent.id,
      tokenId:         tokenDoc.id,
      mainActorId:     mainActor.id,
      packId,
      actorId,
      prevTempActorId,
    };

    if (game.user.isGM) {
      await performSwap(payload);
    } else {
      game.socket.emit("module.metamorph", { action: "performSwap", payload });
    }
  }
}
