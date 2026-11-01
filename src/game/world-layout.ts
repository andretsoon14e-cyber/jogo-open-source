/** Conservative world-space rectangles for the visible, bottom-anchored art.
 * They are independent of optional assets, so paths stay clear even if an
 * image finishes loading after the world has been generated. */
export interface WorldRect { left: number; top: number; right: number; bottom: number; }

export function anchoredRect(x: number, y: number, width: number, height: number, padding = 0): WorldRect {
  return { left: x - width / 2 - padding, right: x + width / 2 + padding, top: y - height - padding, bottom: y + padding };
}

export function rectanglesOverlap(a: WorldRect, b: WorldRect, gap = 0): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

/** Maximum visual extent among the built-in sprites and optional art. */
export function resourceArtBounds(type: string, x: number, y: number): WorldRect {
  // Include outlines, swaying/wobble, and the small shadow below the trunk.
  if (type === "tree" || type === "pine") return { left: x - 80, right: x + 80, top: y - 150, bottom: y + 16 };
  if (type === "rock" || type === "ore" || type === "crystal") return { left: x - 42, right: x + 42, top: y - 78, bottom: y + 10 };
  return { left: x - 34, right: x + 34, top: y - 62, bottom: y + 10 };
}

/** Summed-area table: check every tile touched by a rectangle in O(1).
 * Outside the map is blocked, rather than wrapping onto another row. */
export function tileAreaIndex(tiles: Uint8Array, width: number, height: number, tileSize: number, matches: (tile: number) => boolean) {
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y + 1) * stride + x + 1;
    sums[i] = sums[i - stride] + sums[i - 1] - sums[i - stride - 1] + (matches(tiles[y * width + x]) ? 1 : 0);
  }
  return {
    count(rect: WorldRect): number {
      const x0 = Math.floor(rect.left / tileSize), y0 = Math.floor(rect.top / tileSize);
      const x1 = Math.ceil(rect.right / tileSize), y1 = Math.ceil(rect.bottom / tileSize);
      if (x0 < 1 || y0 < 1 || x1 > width - 1 || y1 > height - 1) return Infinity;
      return sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
    },
  };
}
