# Metamorph

Foundry VTT module for swapping a canvas token between multiple actor forms — boss phases, lycanthropes, shapeshifters. System agnostic.

**Compatibility:** Foundry v13–v14

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

<img width="494" height="303" alt="Screenshot from 2026-06-05 18-12-11" src="https://github.com/user-attachments/assets/c6a7754f-618e-464c-81bb-f295d260816f" />

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

Paste this manifest URL into Foundry's module installer:

```
https://github.com/mordachai/metamorph/releases/download/v1.0.1/module.json
```
