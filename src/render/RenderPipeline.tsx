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
    stats.dom.style.left = "auto";
    stats.dom.style.right = "0px";
    return () => {
      stats.dom.remove();
    };
  }, [gl, stats]);

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
