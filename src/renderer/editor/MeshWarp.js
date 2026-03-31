/**
 * editor/MeshWarp.js — Triangle-mesh warp renderer
 *
 * Warps a source canvas through a 4×4 bilinear control-point mesh.
 * The warp is applied by subdividing the canvas into a fine grid of
 * triangles and mapping each triangle via an affine transform.
 *
 * Mesh format: 16 { dx, dy } objects, row-major top→bottom left→right.
 * dx / dy are offsets in source-canvas pixels from the neutral position.
 * Neutral position of point (r, c): { x: c/3 * srcW, y: r/3 * srcH }.
 *
 * Public API (window.MeshWarp):
 *   createIdentityMesh()                               → [{dx:0,dy:0}×16]
 *   isIdentity(mesh)                                   → bool
 *   applyWarp(dstCtx, srcCanvas, mesh, srcW, srcH)
 */

window.MeshWarp = (() => {
  const ROWS      = 4;
  const COLS      = 4;
  const SUBDIVIDE = 14;   // cells per axis in the fine mesh

  function createIdentityMesh() {
    return Array.from({ length: ROWS * COLS }, () => ({ dx: 0, dy: 0 }));
  }

  function isIdentity(mesh) {
    return !mesh || mesh.every(p => p.dx === 0 && p.dy === 0);
  }

  // ── Bilinear interpolation of mesh offsets at (u,v) ∈ [0,1]² ──────────
  function _interpOffset(mesh, u, v) {
    const col = Math.min(u * (COLS - 1), COLS - 2);
    const row = Math.min(v * (ROWS - 1), ROWS - 2);
    const ci  = Math.floor(col), ri = Math.floor(row);
    const fu  = col - ci,        fv = row - ri;

    const p00 = mesh[ri * COLS + ci];
    const p10 = mesh[ri * COLS + (ci + 1)];
    const p01 = mesh[(ri + 1) * COLS + ci];
    const p11 = mesh[(ri + 1) * COLS + (ci + 1)];

    return {
      dx: p00.dx*(1-fu)*(1-fv) + p10.dx*fu*(1-fv) + p01.dx*(1-fu)*fv + p11.dx*fu*fv,
      dy: p00.dy*(1-fu)*(1-fv) + p10.dy*fu*(1-fv) + p01.dy*(1-fu)*fv + p11.dy*fu*fv,
    };
  }

  function _destPt(mesh, u, v, srcW, srcH) {
    const off = _interpOffset(mesh, u, v);
    return { x: u * srcW + off.dx, y: v * srcH + off.dy };
  }

  // ── Public: apply warp ─────────────────────────────────────────────────
  function applyWarp(dstCtx, srcCanvas, mesh, srcW, srcH) {
    for (let ri = 0; ri < SUBDIVIDE; ri++) {
      for (let ci = 0; ci < SUBDIVIDE; ci++) {
        const u0 = ci / SUBDIVIDE, u1 = (ci + 1) / SUBDIVIDE;
        const v0 = ri / SUBDIVIDE, v1 = (ri + 1) / SUBDIVIDE;

        const s00 = { x: u0 * srcW, y: v0 * srcH };
        const s10 = { x: u1 * srcW, y: v0 * srcH };
        const s01 = { x: u0 * srcW, y: v1 * srcH };
        const s11 = { x: u1 * srcW, y: v1 * srcH };

        const d00 = _destPt(mesh, u0, v0, srcW, srcH);
        const d10 = _destPt(mesh, u1, v0, srcW, srcH);
        const d01 = _destPt(mesh, u0, v1, srcW, srcH);
        const d11 = _destPt(mesh, u1, v1, srcW, srcH);

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

  return { ROWS, COLS, createIdentityMesh, isIdentity, applyWarp };
})();
