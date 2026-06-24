# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Releasing

No build step. Release is fully automated via GitHub Actions (`release.yml`): push to `master` with a changed `version` in `module.json` triggers a release. The workflow zips `module/`, `styles/`, `templates/`, and `module.json`, then publishes a GitHub Release tagged `v{version}`. Update `version` in `module.json` to cut a release.

## Architecture

Plain ES module FoundryVTT v13/v14 module. No bundler, no transpile step. Files load directly via `esmodules` in `module.json`.

### Data model

Group membership is stored entirely as actor flags (`flags.metamorph.data`). Shape:
```js
{ groupId, isMain, order, label, hpMode, groupName }
```
No server-side storage. All group queries scan `game.actors` at runtime filtering by `groupId`.

### Module files

| File | Role |
|---|---|
| `module/metamorph.mjs` | Entry point. Registers hooks: `renderTokenHUD` (adds HUD button), `getActorContextOptions` (sidebar context menu), `renderActorDirectory` (sidebar badges). |
| `module/form-group.mjs` | Pure flag helpers: read/write/remove group membership, create groups, dissolve groups. No UI. |
| `module/token-swap.mjs` | `swapTokenForm(tokenDoc, targetActor)` — updates token to represent target actor (copies prototype token appearance), handles HP transfer per `hpMode`. |
| `module/group-config.mjs` | `GroupConfigApp` (ApplicationV2) — group manager dialog. Handles add/remove/reorder forms and save. Opens `ActorBrowserApp` for actor selection. |
| `module/form-picker.mjs` | `FormPickerApp` (ApplicationV2, singleton, frameless) — portrait grid popup anchored to HUD button. Calls `swapTokenForm` on pick. |
| `module/actor-browser.mjs` | `ActorBrowserApp` (ApplicationV2) — actor selector with folder tree and fuzzy search. Used by `GroupConfigApp`. |
| `module/resolve-img.mjs` | `resolveTokenImg(actor, "first"|"random")` — expands wildcard token texture paths. |

### HP transfer

`token-swap.mjs` probes `system.attributes.hp` then `system.hp` for both source and target (system-agnostic). Modes: `independent` (no transfer), `absolute` (copy value, clamp to max), `percent` (preserve ratio).

### Foundry API notes

- All apps use `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`.
- Templates at `modules/metamorph/templates/*.hbs`.
- CSS at `styles/metamorph.css` — auto-reloaded by Foundry's hot-reload (no compile step needed).
- Use `foundry.applications.handlebars.loadTemplates()` (not deprecated global `loadTemplates()`).
- Scene control tool click handlers use `onChange`, not `onClick`.
