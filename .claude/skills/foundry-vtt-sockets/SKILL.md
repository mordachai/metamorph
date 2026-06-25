---
name: foundry-vtt-sockets
description: Clear, working examples for inter-client communication in Foundry VTT v14 module/system development using ONLY native Foundry sockets — no third-party libraries (socketlib and similar wrappers are explicitly forbidden). Covers both direct sockets (game.socket emit/on) and the query system (CONFIG.queries + User#query). Use this whenever the user is building or debugging a Foundry VTT module or system and needs clients to talk to each other — broadcasting state, delegating privileged Document changes to a GM, prompting a specific user, syncing animations or UI — or wants to remove/replace socketlib with native sockets. Trigger on terms like "socket", "emit", "broadcast", "query", "GM proxy", "real-time sync", and even when none are used, e.g. "make the GM apply this damage on the monster from a player click", "ask the other player to confirm", or "tell every client to play this effect".
---

# Foundry VTT v14 Sockets & Queries

Foundry runs one server with many connected clients (one GM, several players). Sockets let those clients send data to each other directly, without routing through a Document change (chat message, actor update, etc.). Foundry exposes a [socket.io](https://socket.io/docs/v4/) v4 connection on `game.socket`, and — since v13, current in v14 — a higher-level, targeted **query** system via `CONFIG.queries` and `User#query`.

Use this skill to write correct socket and query code. The two mechanisms have different shapes and tradeoffs; pick deliberately using the guide below, then copy the matching pattern from the reference files.

> **Hard constraint: native sockets only.** Build every solution with Foundry's built-in `game.socket` and query system. Never import, suggest, or depend on `socketlib` or any other third-party socket library. See "Native sockets only" below for the native equivalents of common library helpers.

## Two mechanisms, when to use which

| | **Direct sockets** (`game.socket`) | **Queries** (`CONFIG.queries` / `User#query`) |
|---|---|---|
| Audience | Broadcast to **every** other client; emitter filters in the handler | **Targeted**: one user asks one specific user |
| Return value | Ack confirms the **server** received it, not that any client acted | A real `Promise` resolving to the **handler's return value** on the target client |
| Permissions | None built in — you enforce them yourself | `QUERY_USER` permission (all players have it by default; a strict GM can revoke) |
| Best for | Fire-and-forget fan-out: play an effect on all clients, sync transient UI, refresh a panel | Request/response: delegate a privileged Document edit to the GM, ask one user to confirm, fetch data computed on another client |
| Mass send | Native (one emit reaches all) | Loop and `query` each user separately |

Rule of thumb: **if you need an answer back, or you're delegating a permissioned action to one client (usually the GM), use a query.** If you just need to tell everyone "this happened, react to it", use a direct socket.

The most common real case — a player click that must change a Document they can't edit (subtract a monster's HP, create a token, modify another actor) — is best handled with a **query to `game.users.activeGM`**, which runs the change with GM permissions and can return the result. See `references/queries.md` → "GM-delegated mutation".

## Prerequisites (do this first, or nothing works)

1. **Manifest flag.** Add `"socket": true` to `module.json` / `system.json`. Without it the server allots no namespace and emits silently fail. This applies to *both* direct sockets and queries.
2. **Restart the world** after editing the manifest — a reload alone does not re-read it.
3. **Namespaced event names.** Every direct socket event name MUST be `module.{module-id}` or `system.{system-id}` (e.g. `"module.my-cool-module"`). Query keys MUST be prefixed with your package id (e.g. `"my-module.someEvent"`). Unprefixed names are rejected.
4. **JSON-serializable payloads only.** No class instances, `Map`, `Set`, `Date` objects, or `undefined`. Send a Document's `uuid` (a string) and re-fetch with `await fromUuid(uuid)` on the receiving side rather than shipping the whole Document. Keep payloads minimal.

## Quick reference

Direct socket (broadcast to all other clients):

```js
// Listen — register once, on the "ready" hook (or "init")
game.socket.on("module.my-module", (data) => {
  console.log("received", data); // runs on every client EXCEPT the sender
});

// Emit — reaches all other clients, NOT this one
game.socket.emit("module.my-module", { foo: "bar" });
```

Query (targeted request that returns a value):

```js
// Register the handler (runs on the RECEIVING client). Do this in "init".
CONFIG.queries["my-module.someEvent"] = async (queryData, { timeout }) => {
  // ...do work with GM/owner permissions on this client...
  return { ok: true }; // JSON-serializable; sent back to the caller
};

// Invoke it (runs on the SENDING client)
const gm = game.users.activeGM;
const result = await gm.query("my-module.someEvent", { actorUuid }, { timeout: 30 * 1000 });
```

## Two facts that cause most socket bugs

- **The emitter never receives its own broadcast.** If the sending client also needs to react, call the handler locally right after `emit` (or use a query). See `references/direct-sockets.md` → "Run the handler on the emitter too".
- **One namespace per package.** You get exactly one event name. To support many message kinds, send `{ type, payload }` and switch on `type` in the handler. See `references/direct-sockets.md` → "Multiplexing many event types".

## Reference files

Read the relevant file before writing code — they contain complete, copy-ready patterns:

- **`references/direct-sockets.md`** — emit/listen, acknowledgement callbacks, running the handler on the emitter, `{ type, payload }` multiplexing, a reusable `SocketHandler` class, the GM-proxy pattern, targeting one specific user, the full request→ack→broadcast workflow, and a troubleshooting checklist.
- **`references/queries.md`** — registering and invoking queries, GM-delegated Document mutation (the canonical permission workaround), querying every user, timeout and error handling, `DialogV2.query` for prompting another user, the `QUERY_USER` permission, and the built-in `dialog` / `confirmTeleportToken` queries.

## Native sockets only — no third-party libraries

Every solution MUST use only Foundry's built-in socket layer: `game.socket` (emit/on) and the query system (`CONFIG.queries` + `User#query`). Do **not** introduce, import, suggest, or depend on any third-party socket library — `socketlib` in particular is off-limits, as is any other wrapper. The patterns in this skill cover the full set of needs (broadcast, GM delegation, targeting one user, request/response) with zero external dependencies, so there is never a reason to reach for one.

If existing code uses a third-party socket library and the user wants help, reimplement the behavior with the native patterns here rather than building on the library. The native equivalents are: `executeForEveryone` → a direct socket broadcast (plus running the handler locally on the emitter); `executeAsGM` → a query to `game.users.activeGM`; `executeAsUser` → a query to that specific user.
