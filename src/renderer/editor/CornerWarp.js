/**
 * editor/CornerWarp.js — 4-corner bilinear warp renderer
 *
 * Warps a source canvas using 4 independently movable corner handles.
 * Each corner carries a (dx, dy) offset in source-canvas pixels from
 * its neutral position (the canvas's own corner).
 *
 * Neutral corner positions:
 *   tl → (0,    0   )   tr → (srcW, 0   )
 *   bl → (0,    srcH)   br → (srcW, srcH)
 *
 * The warp is applied by subdividing the source into a fine triangle
 * mesh and mapping each triangle via an affine transform, using
 * bilinear interpolation across the 4 corner offsets.
 *
 * Public API (window.CornerWarp):
 *   createIdentity()                               → corners object
 *   isIdentity(corners)                            → bool
 *   applyWarp(dstCtx, srcCanvas, corners, srcW, srcH)
 */

window.CornerWarp = (() => {
  const SUBDIVIDE = 14;

  function createIdentity() {
    return {
      tl: { dx: 0, dy: 0 },
      tr: { dx: 0, dy: 0 },
      bl: { dx: 0, dy: 0 },
      br: { dx: 0, dy: 0 },
    };
  }

  function isIdentity(c) {
    return !c || ['tl', 'tr', 'bl', 'br'].every(k => c[k].dx === 0 && c[k].dy === 0);
  }

  // Bilinear interpolation of the 4 corner positions at normalised (u,v) ∈ [0,1]²
  function _destPt(corners, u, v, srcW, srcH) {
    const TL = { x: 0    + corners.tl.dx, y: 0    + corners.tl.dy };
    const TR = { x: srcW + corners.tr.dx, y: 0    + corners.tr.dy };
    const BL = { x: 0    + corners.bl.dx, y: srcH + corners.bl.dy };
    const BR = { x: srcW + corners.br.dx, y: srcH + corners.br.dy };
    const a = 1 - u, b = 1 - v;
    return {
      x: a*b*TL.x + u*b*TR.x + a*v*BL.x + u*v*BR.x,
      y: a*b*TL.y + u*b*TR.y + a*v*BL.y + u*v*BR.y,
    };
  }

  function applyWarp(dstCtx, srcCanvas, corners, srcW, srcH) {
    for (let ri = 0; ri < SUBDIVIDE; ri++) {
      for (let ci = 0; ci < SUBDIVIDE; ci++) {
        const u0 = ci / SUBDIVIDE, u1 = (ci + 1) / SUBDIVIDE;
        const v0 = ri / SUBDIVIDE, v1 = (ri + 1) / SUBDIVIDE;

        const s00 = { x: u0 * srcW, y: v0 * srcH };
        const s10 = { x: u1 * srcW, y: v0 * srcH };
        const s01 = { x: u0 * srcW, y: v1 * srcH };
        const s11 = { x: u1 * srcW, y: v1 * srcH };

        const d00 = _destPt(corners, u0, v0, srcW, srcH);
        const d10 = _destPt(corners, u1, v0, srcW, srcH);
        const d01 = _destPt(corners, u0, v1, srcW, srcH);
        const d11 = _destPt(corners, u1, v1, srcW, srcH);

        _drawTri(dstCtx, srcCanvas, s00, s10, s11, d00, d10, d11);
        _drawTri(dstCtx, srcCanvas, s00, s11, s01, d00, d11, d01);
      }
    }
  }

  function _drawTri(ctx, src, sp0, sp1, sp2, dp0, dp1, dp2) {
    const m = _solveAffine(sp0, sp1, sp2, dp0, dp1, dp2);
    if (!m) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dp0.x, dp0.y);
    ctx.lineTo(dp1.x, dp1.y);
    ctx.lineTo(dp2.x, dp2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  function _solveAffine(sp0, sp1, sp2, dp0, dp1, dp2) {
    const x0=sp0.x, y0=sp0.y, x1=sp1.x, y1=sp1.y, x2=sp2.x, y2=sp2.y;
    const u0=dp0.x, v0=dp0.y, u1=dp1.x, v1=dp1.y, u2=dp2.x, v2=dp2.y;
    const det = x0*(y1-y2) - x1*(y0-y2) + x2*(y0-y1);
    if (Math.abs(det) < 1e-10) return null;
    return {
      a: (u0*(y1-y2) - u1*(y0-y2) + u2*(y0-y1)) / det,
      b: (v0*(y1-y2) - v1*(y0-y2) + v2*(y0-y1)) / det,
      c: (x0*(u1-u2) - x1*(u0-u2) + x2*(u0-u1)) / det,
      d: (x0*(v1-v2) - x1*(v0-v2) + x2*(v0-v1)) / det,
      e: (x0*(y1*u2-y2*u1) - x1*(y0*u2-y2*u0) + x2*(y0*u1-y1*u0)) / det,
      f: (x0*(y1*v2-y2*v1) - x1*(y0*v2-y2*v0) + x2*(y0*v1-y1*v0)) / det,
    };
  }

  return { createIdentity, isIdentity, applyWarp };
})();
