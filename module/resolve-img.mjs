/**
 * Resolve a token image path, expanding wildcards via Foundry's built-in resolver.
 * Returns a real displayable path, never a glob pattern.
 *
 * @param {Actor} actor
 * @param {"first"|"random"} pick  How to select from multiple wildcard matches
 */
export async function resolveTokenImg(actor, pick = "first") {
  const src = actor.prototypeToken?.texture?.src ?? "";

  if (!src.includes("*")) return src || actor.img;

  try {
    const images = await actor.getTokenImages();
    if (!images?.length) return actor.img;
    if (pick === "random") return images[Math.floor(Math.random() * images.length)];
    return images[0];
  } catch {
    return actor.img;
  }
}
