import * as THREE from "three/webgpu";
import type { SkyGrade } from "./daylight";

// Procedurally generate an HDR equirectangular sky for the current sun and
// palette. Nothing is fetched (bake-don't-fetch): the sky is computed from the
// real sun position (see src/solar) and the art-directed grade (see daylight.ts),
// so dome, IBL, and the directional light all agree and move together through the
// day. Values are linear HDR; the sun disk sits well above 1 so it drives
// specular highlights and seeds bloom.
export function generateSkyEquirect(
  sun: { altitude: number; azimuth: number },
  grade: SkyGrade
): THREE.DataTexture {
  const W = 512;
  const H = 256;
  const data = new Float32Array(W * H * 4);

  const sunAlt = (sun.altitude * Math.PI) / 180;
  const sunAz = (sun.azimuth * Math.PI) / 180 - Math.PI; // into [-PI, PI] longitude

  const zenith = new THREE.Color(grade.zenith[0], grade.zenith[1], grade.zenith[2]);
  const horizon = new THREE.Color(
    grade.horizon[0],
    grade.horizon[1],
    grade.horizon[2]
  );
  const ground = new THREE.Color(grade.ground[0], grade.ground[1], grade.ground[2]);
  const c = new THREE.Color();

  for (let y = 0; y < H; y++) {
    const t = y / (H - 1); // 0 top .. 1 bottom
    const elev = (0.5 - t) * Math.PI; // +PI/2 zenith .. -PI/2 nadir
    for (let x = 0; x < W; x++) {
      const az = (x / W) * 2 * Math.PI - Math.PI; // -PI .. PI

      if (elev >= 0) {
        const k = Math.pow(Math.sin(elev), 0.5);
        c.copy(horizon).lerp(zenith, k);
      } else {
        c.copy(ground);
      }

      // Angular distance to the sun, for a warm halo plus a hot disk, scaled by
      // the grade so dusk glows hard and noon stays calm.
      const cosd =
        Math.sin(elev) * Math.sin(sunAlt) +
        Math.cos(elev) * Math.cos(sunAlt) * Math.cos(az - sunAz);
      const ang = Math.acos(Math.max(-1, Math.min(1, cosd)));
      const glow = (Math.exp(-ang * 7) * 6 + Math.exp(-ang * 40) * 22) * grade.glow;

      const i = (y * W + x) * 4;
      data[i] = (c.r + glow * 1.0) * grade.exposure;
      data[i + 1] = (c.g + glow * 0.78) * grade.exposure;
      data[i + 2] = (c.b + glow * 0.5) * grade.exposure;
      data[i + 3] = 1;
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// The live sky resources: the PMREM render target used as scene.environment and
// the raw equirect used as scene.background. Held so the next update can dispose
// them and GPU memory does not grow as the sun moves.
export type SkyHandle = {
  rt: THREE.RenderTarget;
  sky: THREE.DataTexture;
};

// Regenerate the sky for the current sun and grade, prefilter it to IBL via
// PMREM, install it as both environment and background, and dispose the previous
// resources. Call this throttled (on meaningful sun movement), never per frame.
export function updateProceduralSky(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  sun: { altitude: number; azimuth: number },
  grade: SkyGrade,
  envIntensity: number,
  prev: SkyHandle | null
): SkyHandle {
  const sky = generateSkyEquirect(sun, grade);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(sky);
  pmrem.dispose();

  scene.environment = rt.texture;
  scene.environmentIntensity = envIntensity;
  scene.background = sky;
  scene.backgroundIntensity = 0.7;
  scene.backgroundBlurriness = 0.0;

  if (prev) {
    prev.rt.dispose();
    prev.sky.dispose();
  }

  return { rt, sky };
}
