/**
 * pipeline/warp.js — Mesh warp transform
 *
 * Applies a mesh warp to a text-layer canvas buffer so that rendered
 * player names and numbers conform to the curvature of the jersey.
 *
 * Approach:
 *  1. Receive the source text buffer (node-canvas PNG) + warp grid from KitProfile
 *  2. Divide the image into a grid of patches defined by the profile's control points
 *  3. For each patch, compute the bilinear mapping from source → destination coords
 *  4. Sample the source buffer and write warped pixels to a destination canvas
 *  5. Return the warped buffer as a raw RGBA Buffer for compositing
 *
 * Dependencies: canvas (node-canvas) for pixel-level manipulation
 *
 * @param {Buffer} sourceBuffer  — PNG buffer from node-canvas text layer
 * @param {WarpGrid} warpGrid    — grid of {x, y} control point pairs from KitProfile
 * @param {number} width         — output width in px (matches kit image)
 * @param {number} height        — output height in px (matches kit image)
 * @returns {Promise<Buffer>}    — RGBA raw pixel buffer, same dimensions
 */

'use strict';

async function applyMeshWarp(sourceBuffer, warpGrid, width, height) {
  // TODO: implement bilinear patch warp using node-canvas
  throw new Error('applyMeshWarp not yet implemented');
}

module.exports = { applyMeshWarp };
