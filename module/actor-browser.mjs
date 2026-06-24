import { resolveTokenImg } from "./resolve-img.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function fuzzyMatch(str, query) {
  let qi = 0;
  for (let si = 0; si < str.length && qi < query.length; si++) {
    if (str[si] === query[qi]) qi++;
  }
  return qi === query.length;
}

export class ActorBrowserApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {(actor: Actor | {actorId: string, packId: string, name: string}) => void} */
  #onSelect;
  /** @type {Set<string>} world actor ids to exclude (already in the group) */
  #excluded;
  #abort = null;
  #source = "world";

  constructor(onSelect, excluded = new Set()) {
    super();
    this.#onSelect = onSelect;
    this.#excluded = excluded;
  }

  static DEFAULT_OPTIONS = {
    id: "metamorph-actor-browser",
    classes: ["metamorph-actor-browser"],
    tag: "div",
    window: { title: "Add Form — Select Actor", resizable: true },
    position: { width: 340, height: 500 },
    actions: {
      pickActor: ActorBrowserApp.#onPickActor,
      toggleFolder: ActorBrowserApp.#onToggleFolder,
      setSource: ActorBrowserApp.#onSetSource,
    },
  };

  static PARTS = {
    browser: { template: "modules/metamorph/templates/actor-browser.hbs" },
  };

  async _prepareContext() {
    const actorPacks = game.packs.filter(p => p.metadata.type === "Actor");
    const sources = [
      { id: "world", label: "World", active: this.#source === "world" },
      ...actorPacks.map(p => ({ id: p.collection, label: p.metadata.label, active: this.#source === p.collection })),
    ];

    const { folders, ungrouped } = this.#source === "world"
      ? await this.#buildWorldTree()
      : await this.#buildPackTree(this.#source);

    return { sources, hasSources: sources.length > 1, folders, ungrouped };
  }

  async #buildWorldTree() {
    const folderMap = new Map();
    const ungrouped = [];

    for (const folder of game.folders.filter(f => f.type === "Actor")) {
      folderMap.set(folder.id, { id: folder.id, name: folder.name, actors: [] });
    }

    for (const actor of game.actors) {
      if (this.#excluded.has(actor.id)) continue;
      const entry = {
        id: actor.id,
        name: actor.name,
        nameLower: actor.name.toLowerCase(),
        img: await resolveTokenImg(actor, "first"),
        type: actor.type,
      };
      if (actor.folder) {
        folderMap.get(actor.folder.id)?.actors.push(entry);
      } else {
        ungrouped.push(entry);
      }
    }

    const folders = [...folderMap.values()].filter(f => f.actors.length > 0);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    return { folders, ungrouped };
  }

  async #buildPackTree(packId) {
    const pack = game.packs.get(packId);
    if (!pack) return { folders: [], ungrouped: [] };

    const index = await pack.getIndex({ fields: ["name", "img", "type", "folder"] });

    const folderMap = new Map();
    for (const folder of pack.folders) {
      folderMap.set(folder.id, { id: folder.id, name: folder.name, actors: [] });
    }

    const ungrouped = [];
    for (const entry of index) {
      const actor = {
        id: entry._id,
        packId,
        name: entry.name,
        nameLower: entry.name.toLowerCase(),
        img: entry.img || "icons/svg/mystery-man.svg",
        type: entry.type,
      };
      if (entry.folder) {
        folderMap.get(entry.folder)?.actors.push(actor);
      } else {
        ungrouped.push(actor);
      }
    }

    const folders = [...folderMap.values()].filter(f => f.actors.length > 0);
    return { folders, ungrouped };
  }

  _onRender(context, options) {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    const search = this.element.querySelector(".mm-search-input");
    search?.addEventListener("input", () => this.#filter(search.value), { signal });
    search?.focus();
  }

  async close(options) {
    this.#abort?.abort();
    return super.close(options);
  }

  #filter(query) {
    const q = query.toLowerCase().trim();

    for (const row of this.element.querySelectorAll(".mm-actor-row")) {
      row.hidden = q ? !fuzzyMatch(row.dataset.name, q) : false;
    }

    for (const folder of this.element.querySelectorAll(".mm-folder")) {
      const hasVisible = [...folder.querySelectorAll(".mm-actor-row")].some(r => !r.hidden);
      folder.hidden = !hasVisible;
      if (q) folder.classList.add("open");
    }
  }

  static #onPickActor(event, target) {
    const row = target.closest("[data-actor-id]");
    if (!row) return;
    const { actorId, packId } = row.dataset;
    if (packId) {
      this.#onSelect({ actorId, packId, name: row.dataset.name });
    } else {
      const actor = actorId ? game.actors.get(actorId) : null;
      if (!actor) return;
      this.#onSelect(actor);
    }
    this.close();
  }

  static #onToggleFolder(event, target) {
    target.closest(".mm-folder")?.classList.toggle("open");
  }

  static #onSetSource(event, target) {
    const source = target.dataset.source;
    if (!source || source === this.#source) return;
    this.#source = source;
    this.render();
  }
}
