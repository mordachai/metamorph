# Direct Sockets (`game.socket`)

`game.socket` is the live socket.io v4 connection. Direct sockets **broadcast to every connected client except the one that emitted**. There are no built-in permissions and no real return value — the acknowledgement only confirms the *server* received the event. You filter and react in the handler on each client.

Prerequisites (see SKILL.md): `"socket": true` in the manifest, world restarted, event name namespaced as `module.{id}` / `system.{id}`, payload JSON-serializable.

## Contents
- Basic listen + emit
- Register the listener at the right time
- Acknowledgement callback (confirm server receipt)
- Run the handler on the emitter too
- Multiplexing many event types with `{ type, payload }`
- A reusable `SocketHandler` class
- GM proxy: do privileged work on one GM client
- Target one specific user
- Full request → ack → broadcast workflow
- Troubleshooting checklist

---

## Basic listen + emit

```js
const SOCKET = "module.my-module"; // or "system.my-system"

// Receiving: every client other than the sender runs this
game.socket.on(SOCKET, (arg1, arg2, arg3) => {
  console.log(arg1, arg2, arg3); // -> "foo" "bar" "bat"
});

// Sending: broadcasts to all other clients (this client does NOT receive it)
game.socket.emit(SOCKET, "foo", "bar", "bat");
```

## Register the listener at the right time

Register `game.socket.on(...)` exactly once. The socket exists from the `init` hook onward; `ready` is a safe, common choice because `game.user`, `game.users`, etc. are fully populated by then.

```js
Hooks.once("ready", () => {
  game.socket.on("module.my-module", onSocketMessage);
});

function onSocketMessage(data) {
  // handle it
}
```

Avoid registering inside a function that can run multiple times — duplicate listeners fire the handler multiple times per message.

## Acknowledgement callback (confirm server receipt)

socket.io supports an acknowledgement callback as the last argument. In Foundry it tells you the **server** processed the emit. It does **not** mean other clients finished (or even received) anything — for that you need a second message coming back, or a query.

```js
function emitWithAck(data) {
  return new Promise((resolve) => {
    game.socket.emit("module.my-module", data, (response) => {
      resolve(response); // resolves once the server acknowledges
    });
  });
}

await emitWithAck({ foo: "bar" });
console.log("server acknowledged the emit");
```

If you need to know that *another client* acted, model it as a query instead (see `queries.md`).

## Run the handler on the emitter too

Because the emitter is excluded from its own broadcast, a client that emits and also needs to react must call the handler locally.

```js
// Shared handler used by both the listener and the emitter
function applyEffect(data) {
  // ...play animation, update UI, etc...
}

Hooks.once("ready", () => {
  game.socket.on("module.my-module", applyEffect); // other clients
});

function broadcastEffect(data) {
  game.socket.emit("module.my-module", data); // other clients
  applyEffect(data);                           // this client
}
```

## Multiplexing many event types with `{ type, payload }`

A package gets exactly one event name. To carry many kinds of messages, wrap them with a `type` discriminator and switch on it.

```js
const SOCKET = "module.my-module";

function handleSocketEvent({ type, payload }) {
  switch (type) {
    case "PLAY_EFFECT":
      playEffect(payload);
      break;
    case "REFRESH_PANEL":
      refreshPanel(payload);
      break;
    default:
      console.warn("my-module | unknown socket type:", type);
  }
}

Hooks.once("ready", () => game.socket.on(SOCKET, handleSocketEvent));

// Emit a specific kind
game.socket.emit(SOCKET, { type: "PLAY_EFFECT", payload: { sceneId, x, y } });
```

## A reusable `SocketHandler` class

Encapsulates the multiplexing, local-emitter handling, and a clean `emit(type, payload)` API. Inspired by SWADE's `SwadeSocketHandler`.

```js
class MyModuleSocketHandler {
  constructor() {
    this.identifier = "module.my-module"; // your namespaced event name
    this.#registerListeners();
  }

  #registerListeners() {
    game.socket.on(this.identifier, ({ type, payload }) => this.#dispatch(type, payload));
  }

  #dispatch(type, payload) {
    switch (type) {
      case "PLAY_EFFECT":
        this.#onPlayEffect(payload);
        break;
      default:
        console.warn("my-module | unknown socket type:", type);
    }
  }

  /**
   * Emit to all other clients. Pass { local: true } to also run it here.
   */
  emit(type, payload, { local = false } = {}) {
    game.socket.emit(this.identifier, { type, payload });
    if (local) this.#dispatch(type, payload);
  }

  #onPlayEffect(payload) {
    // ...
  }
}

// Instantiate once and stash it where you can reach it later
Hooks.once("ready", () => {
  const mod = game.modules.get("my-module"); // or use game.system for a system
  mod.socketHandler = new MyModuleSocketHandler();
});

// Usage from anywhere
game.modules.get("my-module").socketHandler.emit("PLAY_EFFECT", { x: 100, y: 200 });
```

## GM proxy: do privileged work on one GM client

Players often can't modify Documents they don't own (e.g. an enemy actor). A classic workaround: broadcast a request, and let the **active GM** be the only client that actually performs the change. Guard the handler so only the GM acts, and pick a single GM to avoid every GM doing it at once.

```js
function onRequest(data) {
  // Only the primary active GM should execute the privileged work
  if (game.user !== game.users.activeGM) return;

  // Safe to mutate here — this client has GM permissions
  const actor = fromUuidSync(data.actorUuid);
  actor?.update({ "system.attributes.hp.value": data.newHp });
}

Hooks.once("ready", () => game.socket.on("module.my-module", onRequest));

// A player calls this; the GM client carries it out
function requestHpChange(actorUuid, newHp) {
  game.socket.emit("module.my-module", { actorUuid, newHp });
}
```

Note: with direct sockets you get no confirmation the GM succeeded. If you need the result (or there might be no GM online), use a query to `game.users.activeGM` instead — see `queries.md`.

## Target one specific user

`emit` can't address a single client — every other client receives the broadcast — so the targeting happens in the handler.

```js
function onTargeted({ targetUserId, payload }) {
  if (targetUserId && game.userId !== targetUserId) return; // ignore unless it's me
  // ...this client is the intended recipient...
  console.log(payload);
}

Hooks.once("ready", () => game.socket.on("module.my-module", onTargeted));

game.socket.emit("module.my-module", { targetUserId: someUser.id, payload: "Hello" });
```

For a true targeted request with a response, a query is cleaner.

## Full request → ack → broadcast workflow

The pattern Foundry core itself uses: the requester encloses the whole transaction in one Promise resolved by the acknowledgement, while all other clients react to a follow-up broadcast.

```js
// Requesting client — wrap the round-trip in a single awaitable Promise
function request(payload) {
  return new Promise((resolve) => {
    game.socket.emit("module.my-module", payload, (response) => {
      handleResponse(response); // act on the requester
      resolve(response);        // whole transaction resolved on ack
    });
  });
}

// All other clients — react only to the broadcast
Hooks.once("ready", () => {
  game.socket.on("module.my-module", (response) => handleResponse(response));
});

function handleResponse(response) {
  // shared reaction used on both sides
}
```

Reminder: the ack confirms the server's involvement; it is not a guarantee that other clients finished. For strict request/response semantics with another client, use a query.

## Troubleshooting checklist

If no event is received:

1. Is `"socket": true` present in the manifest?
2. Did you **restart the world** after editing the manifest (not just reload)?
3. Is the event name correctly namespaced (`module.{id}` / `system.{id}`)?
4. Are you expecting the **emitter** to receive its own broadcast? It won't — run the handler locally (see above).
5. Registered the listener more than once? That causes duplicate handler calls.
6. Is the payload actually JSON-serializable (no class instances, `Map`/`Set`, `Date`, `undefined`)?
