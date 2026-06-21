"use client";

import { useEffect, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import Stats from "stats-gl";

// stats-gl overlay for the ADR-R08 performance budget. FPS and CPU time here;
// full GPU timer-query timing lands with the manual render path in Unit 1b.
export function PerfStats() {
  const gl = useThree((s) => s.gl);
  const [stats] = useState(() => new Stats({ trackGPU: true }));

  useEffect(() => {
    stats.init(gl.domElement);
    document.body.appendChild(stats.dom);
    stats.dom.style.left = "auto";
    stats.dom.style.right = "0px";
    return () => {
      stats.dom.remove();
    };
  }, [gl, stats]);

  useFrame(() => {
    stats.update();
  });

  return null;
}
