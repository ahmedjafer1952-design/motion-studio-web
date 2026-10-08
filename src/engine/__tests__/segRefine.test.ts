import { describe, expect, it } from "vitest";
import { refine } from "../segmentation";

describe("mask refine", () => {
  it("snaps a blurry mask edge to the color edge in the frame, fast", () => {
    // Low-res 64×64 mask: a soft ramp from x=30..34; frame: hard color edge at x=32 (of 64).
    const lw = 64, lh = 64, gw = 256, gh = 256;
    const p = new Float32Array(lw * lh);
    for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) p[j * lw + i] = Math.min(1, Math.max(0, (i - 30) / 4));
    const guide = new Uint8ClampedArray(gw * gh * 4);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const o = (y * gw + x) * 4; const v = x >= 128 ? 220 : 30; guide[o] = guide[o + 1] = guide[o + 2] = v; guide[o + 3] = 255; }
    const t0 = performance.now();
    const out = refine(p, lw, lh, guide, gw, gh);
    const ms = performance.now() - t0;
    // The largest one-pixel step lands exactly on the frame's color edge (x 127→128), where a
    // plain bilinear upscale would be a smooth ramp with no jump there.
    let best = 0, at = -1;
    for (let x = 100; x < 160; x++) { const d = out[100 * gw + x + 1] - out[100 * gw + x]; if (d > best) { best = d; at = x; } }
    expect(at).toBe(127);
    expect(best).toBeGreaterThan(0.25);
    expect(out[100 * gw + 10]).toBe(0);
    expect(out[100 * gw + 250]).toBe(1);
    expect(ms).toBeLessThan(200);
  });
});
