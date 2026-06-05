import { isInGroup, isMainForm, getGroupForms, getGroupName } from "./form-group.mjs";
import { GroupConfigApp } from "./group-config.mjs";
import { FormPickerApp } from "./form-picker.mjs";

// Re-export for macro access
export { GroupConfigApp, FormPickerApp };
export * from "./form-group.mjs";
export * from "./token-swap.mjs";

Hooks.once("init", () => {
  console.log("Metamorph | Initializing");
});

// --- Token HUD: add a single button; picker is a proper ApplicationV2 ---
// Keep this hook SYNCHRONOUS so the button is immediately available.

Hooks.on("renderTokenHUD", (hud, html, _data) => {
  const tokenDoc = hud.object?.document;
  if (!tokenDoc) return;
  const actor = tokenDoc.actor;
  if (!actor?.isOwner) return;

  const right = html.querySelector(".col.right");
  if (!right) return;

  const btn = document.createElement("div");
  btn.className = "control-icon metamorph-hud-btn";
  btn.dataset.tooltip = "Metamorph Forms";
  btn.append(Object.assign(document.createElement("i"), { className: "fa-solid fa-masks-theater" }));

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Metamorph | HUD button clicked, actor:", actor?.name);
    try {
      if (isInGroup(actor) && getGroupForms(actor).length > 1) {
        FormPickerApp.toggle(tokenDoc, btn);
      } else {
        new GroupConfigApp(actor).render({ force: true }).catch(err => {
          console.error("Metamorph | GroupConfigApp render failed:", err);
          ui.notifications.error("Metamorph: failed to open form manager.");
        });
      }
    } catch (err) {
      console.error("Metamorph | HUD button error:", err);
    }
  });

  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    new GroupConfigApp(actor).render({ force: true }).catch(err => {
      console.error("Metamorph | GroupConfigApp render failed:", err);
      ui.notifications.error("Metamorph: failed to open form manager.");
    });
  });

  right.append(btn);
});

// --- Context menu on Actor sidebar ---
// v14: "getActorContextOptions" — entries use { label, icon, visible, onClick }.

Hooks.on("getActorContextOptions", (_app, options) => {
  options.push({
    label: "Metamorph: Manage Forms",
    icon: "fa-solid fa-masks-theater",
    visible: (li) => {
      const actor = game.actors.get(li.dataset.entryId);
      return actor?.isOwner ?? false;
    },
    onClick: (_event, li) => {
      console.log("Metamorph | context menu onClick fired, entryId:", li.dataset.entryId, "li:", li);
      const actor = game.actors.get(li.dataset.entryId);
      if (!actor) { console.warn("Metamorph | actor not found for id:", li.dataset.entryId); return; }
      new GroupConfigApp(actor).render({ force: true }).catch(err => {
        console.error("Metamorph | GroupConfigApp render failed:", err);
        ui.notifications.error("Metamorph: failed to open form manager.");
      });
    },
  });
});

// --- Actor sidebar: group status badges ---
// Append a masks-theater icon to each actor entry that belongs to a group.
// Solid = main form, Regular = dependent form. Same color as the row text.

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
