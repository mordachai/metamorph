This module is free. Wanna do a cool thing?

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

---

![Foundry v13](https://img.shields.io/badge/foundry-v13-green?style=for-the-badge) ![Foundry v14](https://img.shields.io/badge/foundry-v14-blue?style=for-the-badge)  ![Github All Releases](https://img.shields.io/github/downloads/mordachai/metamorph/total.svg?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/metamorph?display_name=tag&style=for-the-badge&label=Current%20version)

# Metamorph

Swap between sheets and tokens: any actor can have multiple forms. This module is a must for boss phases, polymorph spells, lycanthropes, shapeshifters, doppelgangers... System agnostic, check the **Tutorial** tab.

<img width="950" alt="image" src="https://github.com/user-attachments/assets/1a3411e1-a8d8-4dce-8314-aa15625ab338" />

It's not just a change in appearance — it's a complete new character sheet each time, with its own data and abilities. You can share health between forms or keep them fully independent.

---

## What It Does

A HUD button on any configured token opens a form picker. Click a portrait to instantly swap the token to that form. The token's appearance (portrait, size, bars, light, vision) updates from the target actor's prototype token. HP can optionally carry over.

<img width="569" alt="image" src="https://github.com/user-attachments/assets/bc8ea023-e888-4ed9-b9e8-0ef9806374ed" />

There are two ways to populate the picker — use either, or both together.

---

## Two Ways to Set Up Forms

### Actor Forms — hand-picked (best for boss phases)

The simplest approach. Select an actor, go to the **Actors tab**, click **Add Set**, name it, then drag actors from the left panel (or from the Foundry actor sidebar) onto the drop zone. Each set shows up as its own tile in the HUD picker.

- No filters or groups needed.
- Actors are stored directly by name — exactly what you dragged in.
- Sets are **per-actor** and not shared. Perfect for unique encounters: a boss with three phases, a named NPC with a transformed variant, a specific summoned form.

### Filter Groups — query-based (best for druids / polymorph spells)

Define a query once, reuse it everywhere. Filters scan the world and compendiums at pick-time, so new actors that match automatically appear without re-configuring anything.

- **Filters tab** → define queries (actor type, field rules, sources).
- **Groups tab** → bundle filters into a named group.
- **Actors tab → Morph Groups** → assign groups to actors.

Groups are **global** — two druids in the party can share one "Wild Shapes" group.

---

## Setup

Open the configuration window: **scene controls toolbar → masks icon**, or right-click any actor in the sidebar → **Metamorph: Configure**.

### Actor Forms (Actors tab)

<img width="943" alt="image" src="https://github.com/user-attachments/assets/7d2cbbbd-d4e0-4679-9aed-4ec987b350d6" />

1. Click an actor in the left panel → **Actors** tab.
2. Set the **HP on swap** mode.
3. Under **Actor Forms** → click **Add Set**, name it, drag actors from the left panel into the drop zone.
4. Repeat for additional sets (e.g. _Phase 1_, _Phase 2_).

### Filters tab

<img width="950" alt="image" src="https://github.com/user-attachments/assets/f3db253b-12c0-4bc7-b890-17b59ee8d085" />

Filters are the building blocks for query-based groups. Each filter is a named query that finds actors matching a set of rules.

1. Click **New Filter**.
2. Give it a name (e.g. `Druid Beasts CR≤2`).
3. Choose sources (World actors, compendium packs, or both).
4. Optionally restrict by actor type (e.g. `npc`).
5. Add field rules — a path like `system.details.cr` with a value like `<=2`. All rules must match.
6. **Save Preset**. The count of matching actors appears next to the name.

### Groups tab

Groups bundle filters together and appear as sections in the HUD picker.

<img width="829" alt="image" src="https://github.com/user-attachments/assets/f4dabac1-036b-4fc0-b7cb-6a8232a042bc" />

1. Click **New Group** and name it.
2. Expand the group (click the chevron).
3. Use the **Add existing filter** dropdown, or click **New Filter** to create one and auto-add it in one step.

Groups are global — the same group can be assigned to multiple actors.

### Morph Groups (Actors tab)

1. Click any actor in the left panel → **Actors** tab.
2. Under **Morph Groups**, check every group that actor should have access to.

That's it. The HUD button appears on the token once at least one Actor Form set or Morph Group has actors.

---

## Swapping Forms

Select a token on the canvas and open its HUD. Click the **masks icon** to open the form picker.

![Form picker HUD](https://github.com/user-attachments/assets/b7e7ef6a-fa35-4c0c-9da5-15a400da21c2)

The picker shows each group as a section. Click a portrait to swap to that form.

The token keeps its position, rotation, and elevation. Everything else (name, image, size, vision, light, bars) is replaced by the target actor's prototype token settings.

---

## HP Transfer Modes

Set per actor in the **Actors tab**:

| Mode | Behavior |
| --- | --- |
| **Independent** | Each form keeps its own HP. No transfer. |
| **Keep original HP** | The form swaps but HP stays what it was. |
| **Absolute** | Current HP carries over as-is (clamped to new max). |
| **Percent** | Current HP percentage is preserved (e.g. 50% → 50% of new max). |

---

## API

For macros, modules, or systems. Exposed on `ready`:

```js
const mm = game.modules.get("metamorph").api;  // or: globalThis.Metamorph
```

`token` accepts a controlled Token, a TokenDocument, an id, or `{ sceneId, tokenId }`.
`target` accepts an Actor, a uuid, an id, or `{ actorId, packId }`.

| Call | Does |
| --- | --- |
| `morph(token, target, { hpMode? })` | Swap the token to a target form |
| `revert(token)` | Return to the base form |
| `getForm(token)` / `getMainActor(token)` | Read the current / original form |
| `promptForm(token, opts)` | Open a portrait grid, resolve to the choice (no swap) |
| `polymorph(token, opts)` | Prompt **and** morph — the spell entry point |
| `queryFilter(filterOrId)` | Run a filter, return the matching actors |

Filter rules are `{ path, value }`. `value` may be a comparison (`<=2`, `>=4`, `<10`, `>0`) or an exact match (`beast`). All rules must match. `hpMode`: `independent` · `keep-original` · `absolute` · `percent`.

Hooks: `metamorph.preMorph` (return `false` to cancel), `metamorph.morph`, `metamorph.revert`.

### Examples

**Find your Actor compendium ids** (use as filter `sources`):

```js
game.packs.filter(p => p.metadata.type === "Actor").map(p => p.collection);
```

**D&D 5e — Wild Shape** (beasts up to a CR that scales with druid level, HP carried as %):

```js
const token = canvas.tokens.controlled[0];
const druidLvl = token.actor.classes?.druid?.system?.levels ?? 1;
const cr = Math.max(0, Math.floor(druidLvl / 3));   // illustrative — adjust to taste
await Metamorph.polymorph(token, {
  title: `Wild Shape (CR ≤ ${cr})`,
  hpMode: "percent",
  filter: {
    sources: ["dnd5e.monsters"],
    criteria: {
      actorTypes: ["npc"],
      rules: [
        { path: "system.details.type.value", value: "beast" },
        { path: "system.details.cr", value: `<=${cr}` },
      ],
    },
  },
});
```

**Pathfinder 2e — battle form** (bestiary creatures at or below your level):

```js
const token = canvas.tokens.controlled[0];
const lvl = token.actor.system.details?.level?.value ?? 1;
await Metamorph.polymorph(token, {
  title: `Polymorph (level ≤ ${lvl})`,
  filter: {
    sources: ["pf2e.pathfinder-bestiary"],
    criteria: {
      actorTypes: ["npc"],
      rules: [{ path: "system.details.level.value", value: `<=${lvl}` }],
    },
  },
});
```

**Shadowdark — transform** (world NPCs of level 3 or less; swap `sources` for your monster pack):

```js
const token = canvas.tokens.controlled[0];
await Metamorph.polymorph(token, {
  title: "Transform",
  filter: {
    sources: ["world"],
    criteria: {
      actorTypes: ["NPC"],
      rules: [{ path: "system.level.value", value: "<=3" }],
    },
  },
});
```

**Direct swap and revert** (any system, by uuid):

```js
const token = canvas.tokens.controlled[0];
await Metamorph.morph(token, "Compendium.dnd5e.monsters.Actor.<id>");
await Metamorph.revert(token);   // later
```

**Query without UI** (build your own automation):

```js
const beasts = await Metamorph.queryFilter({
  sources: ["dnd5e.monsters"],
  criteria: { actorTypes: ["npc"], rules: [{ path: "system.details.cr", value: "<=1" }] },
});
// → [{ actorId, packId, name, img, type }, ...]
```

---

## Installation

Search for _metamorph_ in Addon Modules OR paste this manifest URL into Foundry's module installer:

```
https://github.com/mordachai/metamorph/releases/download/v1.0.1/module.json
```
