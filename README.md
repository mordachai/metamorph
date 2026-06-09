This module is free. Wanna do a cool thing?

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

---

![Foundry v13](https://img.shields.io/badge/foundry-v13-green?style=for-the-badge) ![Foundry v14](https://img.shields.io/badge/foundry-v14-blue?style=for-the-badge)  ![Github All Releases](https://img.shields.io/github/downloads/mordachai/metamorph/total.svg?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/metamorph?display_name=tag&style=for-the-badge&label=Current%20version)

# Metamorph

Swap between sheets and tokens: any actor can have multiple forms. This module is a must for boss phases, polymorph spells, lycanthropes, shapeshifters, doppelgangers... System agnostic.

It's not just a change in the appearance, its a complete new character sheet each time, with their own data and abilities. You can share the health between them or make them completely independent.

---

## What It Does

Groups two or more actors into a **form group**. A HUD button lets you instantly swap a token on the canvas to any form in the group. The token's appearance (portrait, size, bars, light, vision) updates from the target actor's prototype token. HP can optionally carry over between forms.

---

## Setup

<img width="885" height="461" alt="Screenshot from 2026-06-05 17-51-37" src="https://github.com/user-attachments/assets/2d66e769-b91a-4b90-bf74-ade0625f9c46" />

1. Install the module and enable it in your world.
2. Open the **Actors** sidebar, right-click any actor, and choose **Metamorph: Manage Forms**.
3. Add the other actors that represent alternate forms of this character.
4. Mark one as the **main** form and set an HP transfer mode (see below).
5. Click **Save**.

---

## Swapping Forms

Select a token on the canvas and open its HUD. Click the **masks icon** to open the form picker. Click any portrait to swap to that form.

<img width="950" height="486" alt="image" src="https://github.com/user-attachments/assets/b7e7ef6a-fa35-4c0c-9da5-15a400da21c2" />


- **Left-click** the HUD button — opens the portrait picker (if the actor is in a group with 2+ forms).
- **Right-click** the HUD button — opens the group manager.

The token keeps its position, rotation, and elevation. Everything else (name, image, size, vision, light, bars) is replaced by the target actor's prototype token settings.

---

## HP Transfer Modes

Set per group in the group manager:

| Mode | Behavior |
|---|---|
| **Independent** | Each form keeps its own HP. No transfer. |
| **Absolute** | Current HP carries over as-is (clamped to the new form's max). |
| **Percent** | Current HP percentage is preserved (e.g. 50% → 50% of new max). |

---

## Installation

Search for _metamorph_ in Addon Modules OR

Paste this manifest URL into Foundry's module installer:

```
https://github.com/mordachai/metamorph/releases/download/v1.0.1/module.json
```
