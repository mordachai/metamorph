This module is free. Wanna do a cool thing?

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

---

![Foundry v13](https://img.shields.io/badge/foundry-v13-green?style=for-the-badge) ![Foundry v14](https://img.shields.io/badge/foundry-v14-blue?style=for-the-badge)  ![Github All Releases](https://img.shields.io/github/downloads/mordachai/metamorph/total.svg?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/metamorph?display_name=tag&style=for-the-badge&label=Current%20version)

# Metamorph

Swap between sheets and tokens: any actor can have multiple forms. This module is a must for boss phases, polymorph spells, lycanthropes, shapeshifters, doppelgangers... System agnostic.

It's not just a change in appearance — it's a complete new character sheet each time, with its own data and abilities. You can share health between forms or keep them fully independent.

---

## What It Does

A HUD button on any configured token opens a picker divided into **morph groups**. Click a portrait to instantly swap the token to that form. The token's appearance (portrait, size, bars, light, vision) updates from the target actor's prototype token. HP can optionally carry over.

Morph groups are built from **filter presets** — reusable queries that find actors by type, system field values, or compendium source. One group can be shared across as many actors as you want (two druids in the party, same group).

---

## Setup

Open the configuration window: **scene controls toolbar → masks icon**, or right-click any actor in the sidebar → **Metamorph: Configure**.

The configuration window has three tabs.

### Filters tab

Filters are the building blocks. Each filter is a named query that finds actors matching a set of rules.

1. Click **New Filter**.
2. Give it a name (e.g. `Druid Beasts CR≤2`).
3. Choose sources (World actors, compendium packs, or both).
4. Optionally restrict by actor type (e.g. `npc`).
5. Add field rules — a path like `system.details.cr` with a value like `<=2`. All rules must match.
6. **Save Preset**. The count of matching actors appears next to the name.

### Groups tab

Groups bundle filters together and appear as sections in the HUD picker.

1. Click **New Group** and name it.
2. Expand the group (click the chevron).
3. Use the **Add existing filter** dropdown to pick filters already defined, or click **New Filter** to create one and auto-add it to this group in one step.

Groups are global — the same group can be assigned to multiple actors.

### Actors tab

1. Click any actor in the left panel.
2. Set the **HP on swap** mode for that actor.
3. Check every group that actor should have access to.

That's it. The HUD button appears on the token once at least one assigned group has matching actors.

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

## Installation

Search for _metamorph_ in Addon Modules OR paste this manifest URL into Foundry's module installer:

```
https://github.com/mordachai/metamorph/releases/download/v1.0.1/module.json
```
