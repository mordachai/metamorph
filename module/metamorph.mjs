import { isInGroup, isMainForm, getGroupName, getMainActor } from "./form-group.mjs";
import { GroupConfigApp } from "./group-config.mjs";
import { FormPickerApp } from "./form-picker.mjs";
import { FilterPresetApp } from "./filter-preset-app.mjs";
import { MetamorphConfigApp } from "./metamorph-config-app.mjs";
import { performSwap } from "./token-swap.mjs";
import { actorHasAssignments, migrateActorAssignments } from "./filter-presets.mjs";

// Re-export for macro access
export { GroupConfigApp, FormPickerApp, FilterPresetApp, MetamorphConfigApp };
export * from "./form-group.mjs";
export * from "./token-swap.mjs";
export * from "./filter-presets.mjs";

Hooks.once("init", () => {
  console.log("Metamorph | Initializing");

  game.settings.register("metamorph", "filterPresets", {
    name: "Filter Presets",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register("metamorph", "morphGroups", {
    name: "Morph Groups",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register("metamorph", "actorAssignments", {
    name: "Actor Assignments",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.registerMenu("metamorph", "configurationMenu", {
    name: "Configuration",
    label: "Open Configuration",
    hint: "Manage filter presets and assign morph groups to actors.",
    icon: "fa-solid fa-masks-theater",
    type: MetamorphConfigApp,
    restricted: true,
  });

  foundry.applications.handlebars.loadTemplates([
    "modules/metamorph/templates/group-config.hbs",
    "modules/metamorph/templates/form-picker.hbs",
    "modules/metamorph/templates/metamorph-config-app.hbs",
  ]);
});

Hooks.once("ready", () => {
  migrateActorAssignments().catch(err =>
    console.error("Metamorph | Migration failed:", err)
  );

  game.socket.on("module.metamorph", async (data) => {
    if (!game.user.isGM) return;
    if (data.action === "performSwap") {
      await performSwap(data.payload).catch(err => {
        console.error("Metamorph | socket performSwap failed:", err);
      });
    }
  });
});

// ── Token HUD button ──────────────────────────────────────────

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  // v14: controls is an object map keyed by control name
  const tokenControl = controls.token ?? controls.tokens;
  if (!tokenControl) return;
  (tokenControl.tools ??= {})["metamorph-assign"] = {
    name: "metamorph-assign",
    title: "Metamorph: Configure Access",
    icon: "fa-solid fa-masks-theater",
    button: true,
    onChange: () => new MetamorphConfigApp().render({ force: true }),
  };
});

Hooks.on("renderTokenHUD", (hud, html, _data) => {
  const tokenDoc = hud.object?.document;
  if (!tokenDoc) return;
  const actor = tokenDoc.actor;
  if (!actor?.isOwner) return;
  const mainActor = getMainActor(actor) ?? actor;
  if (!actorHasAssignments(mainActor.id)) return;

  const right = html.querySelector(".col.right");
  if (!right) return;

  const btn = document.createElement("div");
  btn.className = "control-icon metamorph-hud-btn";
  btn.dataset.tooltip = "Metamorph Forms";
  btn.append(Object.assign(document.createElement("i"), { className: "fa-solid fa-masks-theater" }));

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      FormPickerApp.toggle(tokenDoc, btn);
    } catch (err) {
      console.error("Metamorph | HUD button error:", err);
    }
  });

  right.append(btn);
});

// ── Actor sidebar context menu ────────────────────────────────

Hooks.on("getActorContextOptions", (_app, options) => {
  options.push({
    label: "Metamorph: Configure",
    icon: "fa-solid fa-masks-theater",
    visible: (li) => game.user.isGM,
    onClick: (_event, li) => {
      const actor = game.actors.get(li.dataset.entryId);
      if (!actor) return;
      MetamorphConfigApp.openForActor(actor.id).catch(err => {
        console.error("Metamorph | MetamorphConfigApp render failed:", err);
        ui.notifications.error("Metamorph: failed to open configuration.");
      });
    },
  });
});

// ── Actor sidebar badges ──────────────────────────────────────

Hooks.on("renderActorDirectory", (_app, html) => {
  for (const old of html.querySelectorAll(".mm-sidebar-status")) old.remove();
  for (const li of html.querySelectorAll(".directory-item.document[data-entry-id]")) {
    const actor = game.actors?.get(li.dataset.entryId);
    if (!actor || !isInGroup(actor)) continue;
    const icon = document.createElement("i");
    icon.className = isMainForm(actor)
      ? "fa-solid fa-masks-theater mm-sidebar-status"
      : "fa-regular fa-masks-theater mm-sidebar-status";
    icon.title = getGroupName(actor) || "";
    li.append(icon);
  }
});
