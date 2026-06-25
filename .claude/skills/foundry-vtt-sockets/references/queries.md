# Queries (`CONFIG.queries` + `User#query`)

Queries are the v13+ (current in v14) targeted request/response layer over sockets. One user asks **one specific user** to run a registered function and `await`s its return value as a real Promise. Unlike direct sockets, a query gives you a genuine answer back from the target client and is governed by the `QUERY_USER` permission.

Prerequisites (see SKILL.md): `"socket": true` in the manifest, world restarted, query key prefixed with your package id, payload and return value JSON-serializable.

## Contents
- Registering a query handler
- Invoking a query
- GM-delegated mutation (the canonical permission workaround)
- Querying every user
- Timeout and error handling
- `DialogV2.query` — prompt another user
- The `QUERY_USER` permission
- Built-in queries: `dialog` and `confirmTeleportToken`

---

## Registering a query handler

Add an entry to `CONFIG.queries` keyed by `"{package-id}.{eventName}"`. The handler runs **on the client that receives the query** and must return JSON-serializable data, which is sent back to the caller. Register during `init` so it exists before any query arrives.

```js
Hooks.once("init", () => {
  // Signature: async (queryData, { timeout }) => JSON-serializable result
  CONFIG.queries["my-module.someEvent"] = async (queryData, { timeout }) => {
    // queryData is whatever the caller passed in
    const { actorUuid } = queryData;
    const actor = await fromUuid(actorUuid);
    return { name: actor?.name ?? null, hp: actor?.system?.attributes?.hp?.value ?? null };
  };
});
```

Notes:
- `queryData` is your arbitrary, JSON-serializable input.
- The second argument is `queryOptions`, and currently only carries `timeout`. It's destructured everywhere, so you can't smuggle extra options through it — put any additional data inside `queryData`.
- Whatever you `return` (or `throw`) travels back to the caller, so keep returns serializable.

## Invoking a query

Call `User#query(queryName, queryData, { timeout })` on the user you want to run it. `timeout` is in **milliseconds** and is optional.

```js
// Pick the target user with your own logic. The active GM is the usual
// choice when you need to delegate a permissioned action.
const user = game.users.activeGM;

const queryData = { actorUuid: actor.uuid };

const result = await user.query("my-module.someEvent", queryData, { timeout: 30 * 1000 });
// result is whatever the handler returned on the target client
```

## GM-delegated mutation (the canonical permission workaround)

The most common use: a player triggers a change to a Document they can't edit (subtract a monster's HP, create a token, edit another player's actor). Send a query to the active GM, who performs the change with GM permissions and returns the outcome. This replaces the old "GM proxy over direct sockets" dance and gives you a real result.

```js
// --- Register on every client (init) ---
Hooks.once("init", () => {
  CONFIG.queries["my-module.applyDamage"] = async ({ actorUuid, amount }) => {
    const actor = await fromUuid(actorUuid);
    if (!actor) return { ok: false, reason: "actor-not-found" };

    const hp = actor.system.attributes.hp;
    const newValue = Math.max(0, hp.value - amount);
    await actor.update({ "system.attributes.hp.value": newValue });

    return { ok: true, newValue }; // returned to the calling player
  };
});

// --- Called by a player (e.g. from a button click) ---
async function dealDamage(actor, amount) {
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn("A GM must be online to apply damage.");
    return;
  }

  // If the current user can already edit it, skip the round-trip
  if (actor.isOwner) {
    const hp = actor.system.attributes.hp;
    return actor.update({ "system.attributes.hp.value": Math.max(0, hp.value - amount) });
  }

  const result = await gm.query(
    "my-module.applyDamage",
    { actorUuid: actor.uuid, amount },
    { timeout: 20 * 1000 }
  );

  if (result?.ok) ui.notifications.info(`HP is now ${result.newValue}.`);
  else ui.notifications.error(`Could not apply damage: ${result?.reason ?? "unknown"}`);
}
```

## Querying every user

A query is one-to-one, so to reach everyone you loop and query each connected user. `Promise.allSettled` lets one slow or failing client not sink the rest.

```js
async function askAll(queryName, queryData, { timeout = 15 * 1000 } = {}) {
  const targets = game.users.filter((u) => u.active && u.id !== game.userId);
  const settled = await Promise.allSettled(
    targets.map((u) => u.query(queryName, queryData, { timeout }))
  );
  return targets.map((u, i) => ({
    user: u,
    status: settled[i].status,
    value: settled[i].value, // present when fulfilled
    reason: settled[i].reason, // present when rejected/timed out
  }));
}
```

If you just want fire-and-forget fan-out with no responses, a direct socket broadcast is simpler — see `direct-sockets.md`.

## Timeout and error handling

A query rejects if it times out, if the handler throws, or if the target disconnects. Always wrap in `try/catch` (or `Promise.allSettled` for batches).

```js
try {
  const result = await game.users.activeGM.query(
    "my-module.someEvent",
    { foo: "bar" },
    { timeout: 10 * 1000 }
  );
  // use result
} catch (err) {
  console.error("my-module | query failed or timed out:", err);
  ui.notifications.warn("The request did not complete.");
}
```

Pick a `timeout` generous enough for the work but short enough that a stuck client doesn't hang your flow. Multiply for readability: `30 * 1000` is clearer than `30000`.

## `DialogV2.query` — prompt another user

`foundry.applications.api.DialogV2.query(user, type, config)` is a thin wrapper that asks another user to answer a dialog and returns their response, handling the socket/promise plumbing for you. It is roughly equivalent to calling `user.query("dialog", { type, config })`, except it doesn't expose the `timeout` option.

```js
const user = game.users.activeGM;

const dialogConfig = {
  window: { title: "Proceed?" },
  content: "<p>Do you wish to continue?</p>",
};

// Wrapper form
const proceed = await foundry.applications.api.DialogV2.query(user, "confirm", dialogConfig);

// Equivalent low-level form, with a timeout
const proceedB = await user.query(
  "dialog",
  { type: "confirm", config: dialogConfig },
  { timeout: 30 * 1000 }
);
```

The `"input"` type is especially powerful: it lets you collect arbitrary structured data from the target user and pass it back, which is handy for coordinating rolls or choices across clients. When you have many inputs, `foundry.utils.expandObject` turns the flat `name → value` result into a nested object.

## The `QUERY_USER` permission

Queries are gated by the `QUERY_USER` permission. All players have it by default, but a strict GM can revoke it in permission configuration. If queries to/from players silently fail for a non-GM, check this permission before debugging further. Direct sockets have no such gate.

## Built-in queries: `dialog` and `confirmTeleportToken`

Foundry ships two default queries you can call without registering anything:

- `dialog` — the general-purpose prompt used by `DialogV2.query` above. Types: `"input" | "wait" | "prompt" | "confirm"`.
- `confirmTeleportToken` — `{ behaviorUuid, tokenUuid } => Promise<boolean>`, used by region teleport behaviors.

Your own queries must be prefixed with your package id (e.g. `"my-module.aCustomQuery"`) so they never collide with core or other packages.
