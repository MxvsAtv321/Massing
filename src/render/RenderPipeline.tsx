"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { pass, mrt, output, transformedNormalView, vec3, vec4 } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import Stats from "stats-gl";

// Takes over the render loop to run the WebGPU node post pipeline (ADR-R01):
// GTAO for contact darkening in the crevices the flat 1a render was missing,
// bloom on the bright HDR sun glints, AgX applied as the output transform.
// Guarded: if the node graph cannot build (for example a compute-dependent pass
// on the WebGL2 backend) it falls back to a direct render, the visibly-lesser
// path, rather than black-screening.
export function RenderPipeline() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
  const camera = useThree((s) => s.camera);

  const [stats] = useState(() => new Stats({ trackGPU: true }));

  const post = useMemo(() => {
    try {
      const scenePass = pass(scene, camera);
      scenePass.setMRT(mrt({ output, normal: transformedNormalView }));

      const color = scenePass.getTextureNode("output");
      const normal = scenePass.getTextureNode("normal");
      const depth = scenePass.getTextureNode("depth");

      const aoPass = ao(depth, normal, camera);
      // GTAO at half resolution (ADR-R08). Ambient occlusion is low-frequency, so a
      // half-res pass is near-invisible while cutting this pass, one of the heaviest
      // (many depth taps per pixel), to about a quarter of its full-res cost. It is
      // upsampled when sampled into the beauty below.
      aoPass.resolutionScale = 0.5;
      // GTAO stores occlusion in the red channel only (RedFormat). Broadcast it
      // to rgb so it darkens the beauty, rather than multiplying the raw texture
      // in and zeroing green and blue (which floods the scene red).
      const occlusion = aoPass.getTextureNode().r;
      const lit = color.mul(vec4(vec3(occlusion), 1));
      const bloomPass = bloom(lit, 0.6, 0.5, 0.85);

      const pp = new THREE.PostProcessing(gl);
      pp.outputNode = lit.add(bloomPass);
      return pp;
    } catch (e) {
      console.warn("[massing] node post unavailable; rendering without post", e);
      return null;
    }
  }, [gl, scene, camera]);

  useEffect(() => {
    // Pass the WebGPURenderer, not its canvas: stats-gl takes the WebGPU path
    // (timestamp-query GPU timing via renderer.backend). Passing the canvas made
    // it try canvas.getContext("webgl2"), which fails on a canvas that already
    // owns a WebGPU context.
    void stats.init(gl);
    document.body.appendChild(stats.dom);
    // Pin top-right above the canvas and clear of the browser chrome, scaled up so
    // the FPS/GPU-ms numbers are legible for the performance gate (ADR-R08).
    stats.dom.style.position = "fixed";
    stats.dom.style.left = "auto";
    stats.dom.style.right = "8px";
    stats.dom.style.top = "8px";
    stats.dom.style.zIndex = "10000";
    stats.dom.style.transformOrigin = "top right";
    stats.dom.style.transform = "scale(2)";
    return () => {
      stats.dom.remove();
    };
  }, [gl, stats]);

  // Always-visible FPS/draw-call readout for the performance gate (ADR-R08).
  // Self-rolled so it does not depend on stats-gl's panel, which sits hidden behind
  // the browser chrome here. Top-left, clear of the bottom-left backend badge.
  const hudRef = useRef<HTMLDivElement | null>(null);
  const perf = useRef({ frames: 0, last: 0 });
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:10000;padding:6px 10px;" +
      "font:600 13px/1.4 ui-monospace,Menlo,monospace;color:#cdf;" +
      "background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.15);" +
      "border-radius:6px;pointer-events:none;white-space:pre";
    el.textContent = "fps --";
    document.body.appendChild(el);
    hudRef.current = el;
    return () => {
      el.remove();
      hudRef.current = null;
    };
  }, []);

  // Priority > 0 disables R3F's automatic render so we own the frame. The guard
  // prevents overlapping async renders.
  const rendering = useRef(false);
  useFrame(() => {
    if (rendering.current) return;
    rendering.current = true;
    stats.begin();
    const finish = () => {
      stats.end();
      stats.update();
      rendering.current = false;
      const p = perf.current;
      const now = performance.now();
      if (p.last === 0) p.last = now;
      p.frames++;
      const dt = now - p.last;
      if (dt >= 250 && hudRef.current) {
        const fps = (p.frames * 1000) / dt;
        const ms = dt / p.frames;
        const info = (gl as unknown as {
          info?: { render?: { drawCalls?: number } };
        }).info;
        const draws = info?.render?.drawCalls ?? 0;
        hudRef.current.textContent = `fps ${fps.toFixed(0)}   ${ms.toFixed(
          1
        )} ms   draws ${draws}`;
        p.frames = 0;
        p.last = now;
      }
    };
    if (post) {
      post.renderAsync().then(finish, finish);
    } else {
      gl.render(scene, camera);
      finish();
    }
  }, 1);

  return null;
}
