# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No package.json, no lint/test tooling, no npm scripts. Edit `.mjs`/`.hbs`/`.css` directly and reload Foundry (CSS/hbs/json hot-reload per `module.json` `flags.hotReload`; `.mjs` needs a full world reload).

## Releasing

No build step. Release is fully automated via GitHub Actions (`release.yml`): push to `master` with a changed `version` in `module.json` triggers a release. The workflow zips `module/`, `styles/`, `templates/`, and `module.json`, then publishes a GitHub Release tagged `v{version}`. Update `version` in `module.json` to cut a release.

## Architecture

Plain ES module FoundryVTT v13/v14 module. No bundler, no transpile step. Files load directly via `esmodules` in `module.json`.

### Data model

Configuration lives in **world settings** (`filter-presets.mjs` owns the CRUD):

- `filterPresets` — `[{ id, name, sources: ["world"|packId], criteria: { actorTypes[], rules: [{path, value}] } }]`
- `morphGroups` — `[{ id, name, presetIds[], actors: [{actorId, packId?, name, img}] }]` (reusable, shared across actors). `presetIds` resolve via `queryFilter`; `actors` is a fixed hand-picked list (no filter) — same shape as `actorDirectSets`, but global/shared instead of per-actor. Both feed the same picker section, deduped by `actorId::packId`.
- `actorAssignments` — `{ [actorId]: groupId[] }`
- `actorDirectSets` — `{ [actorId]: [{ id, name, actors: [{actorId, packId?, name, img}] }] }`

Per-actor flags:
- Main actor: `flags.metamorph.group = { groupName, hpMode }`
- Temp morph actor: `flags.metamorph.temp = { mainActorId, sourcePackId, sourceActorId }` — `sourcePackId` is `null` for a world-actor source. Every non-base target (compendium entry **or** world actor) is cloned into a private per-main-actor copy in world folder `Metamorph/<name> - morphs`, imported/cloned on demand and deleted on next form change (`token-swap.mjs#getOrCreateTempForm`). Cloning (rather than swapping to the shared source document) keeps naming isolated when the same source actor is used by multiple characters (e.g. a shared "Wild Shapes" group).
- Token (world-actor swaps): `flags.metamorph.mainActorId` — kept as a fallback for the picker/HUD; normally redundant since the temp clone already carries its own `mainActorId`.

### Module files

| File | Role |
|---|---|
| `module/metamorph.mjs` | Entry point. Settings + `CONFIG.queries["metamorph.performSwap"]` registration; HUD button, sidebar context menu + badges, scene-control button. Exposes the API on `ready`. |
| `module/api.mjs` | **Public API** (`game.modules.get("metamorph").api`, `globalThis.Metamorph`). Arg normalizers + `morph`/`revert`/`promptForm`/`polymorph` + filter/group/set CRUD. |
| `module/form-group.mjs` | Flag helpers: group/temp data read/write, `getMainActorFromToken`. |
| `module/filter-presets.mjs` | Settings CRUD for presets/groups/assignments/sets + the `queryFilter` query engine + migration. |
| `module/token-swap.mjs` | `swapTokenForm` (token update + HP transfer + morph hooks), `performSwap` (GM-side import/dedup/delete), `requestSwap` (GM-direct vs player→GM query routing). |
| `module/metamorph-config-app.mjs` | `MetamorphConfigApp` — main config dialog (Actors / Groups / Filters tabs). |
| `module/form-picker.mjs` | `FormPickerApp` (singleton, frameless) — HUD portrait-grid popup. Calls `requestSwap` on pick. |
| `module/group-config.mjs`, `actor-browser.mjs`, `actor-assignment-app.mjs`, `filter-preset-app.mjs` | Older/secondary ApplicationV2 UIs. |
| `module/resolve-img.mjs` | `resolveTokenImg(actor, "first" \| "random")` — expands wildcard token textures. |

### Form naming

A temp clone's own `name` becomes `"<mainActor.name> (<originalFormName>)"` (e.g. `Peter (Lion)`), but its `prototypeToken.name` is forced back to `mainActor.name` — so the actor sheet header shows the form while the placed token (and its nameplate) always shows the character's own name. Set once at clone time in `getOrCreateTempForm`; not re-applied on cache reuse.

### HP transfer

`token-swap.mjs` probes `system.attributes.hp` then `system.hp` for both source and target (system-agnostic). Modes: `independent` (no transfer), `keep-original`, `absolute` (clamp to max), `percent` (preserve ratio). `swapTokenForm` accepts a one-shot `hpMode` override.

### Inter-client (sockets)

`module.json` has `"socket": true` (required — without it emits silently fail; restart the world after changing). Privileged swaps use the **native query** system, not `game.socket` and not socketlib: players call `game.users.activeGM.query("metamorph.performSwap", payload)` and await a real `{ok}` result. See the `foundry-vtt-sockets` skill in `.claude/skills/`.

### Public API

Exposed on `ready` at `game.modules.get("metamorph").api` and `globalThis.Metamorph`. Key calls:
- `morph(token, target, {hpMode?})`, `revert(token)`, `getForm(token)`, `getMainActor(token)`
- `promptForm(token, {filter|filterId|actors, title})` → chosen `{actorId, packId}|null`
- `polymorph(token, opts)` / `openMenu` — prompt + morph (the spell-macro entry point)
- `queryFilter(presetOrId)`, `listFilters/getFilter/saveFilter/deleteFilter`
- `listGroups/getGroup/saveGroup/deleteGroup`, `getActorSets/saveActorSets/assignGroups`
- `openConfig()`, `openConfigForActor(id)`, `openPicker(token, anchorEl)`

`token` accepts TokenDocument / placeable Token / id / `{sceneId, tokenId}`. `target` accepts Actor / uuid / id / `{actorId, packId}`.

Hooks emitted by `swapTokenForm`: `metamorph.preMorph(tokenDoc, target, source)` (return `false` to cancel), `metamorph.morph(tokenDoc, target, source)` (every swap), and `metamorph.revert(tokenDoc, target, source)` (additionally, when returning to base form).

### Foundry API notes

- All apps use `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`.
- Templates at `modules/metamorph/templates/*.hbs`.
- CSS at `styles/metamorph.css` — auto-reloaded by Foundry's hot-reload (no compile step needed).
- Use `foundry.applications.handlebars.loadTemplates()` (not deprecated global `loadTemplates()`).
- Scene control tool click handlers use `onChange`, not `onClick`.
