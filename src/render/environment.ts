import * as THREE from "three/webgpu";

// Procedurally generate an HDR equirectangular sky as the IBL source. No external
// asset and nothing fetched (honors bake-don't-fetch); a photographic .hdr can
// replace this once the look targets land. Values are linear HDR, with the sun
// disk well above 1 so it drives specular highlights and seeds bloom in Unit 1b.
export function generateSkyEquirect(sun: {
  altitude: number;
  azimuth: number;
}): THREE.DataTexture {
  const W = 512;
  const H = 256;
  const data = new Float32Array(W * H * 4);

  const sunAlt = (sun.altitude * Math.PI) / 180;
  const sunAz = (sun.azimuth * Math.PI) / 180 - Math.PI; // into the [-PI, PI] longitude used below

  const zenith = new THREE.Color(0.16, 0.26, 0.46);
  const horizon = new THREE.Color(1.0, 0.66, 0.39);
  const ground = new THREE.Color(0.05, 0.05, 0.055);
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

      // Angular distance to the sun, for a warm halo plus a hot disk.
      const cosd =
        Math.sin(elev) * Math.sin(sunAlt) +
        Math.cos(elev) * Math.cos(sunAlt) * Math.cos(az - sunAz);
      const ang = Math.acos(Math.max(-1, Math.min(1, cosd)));
      const glow = Math.exp(-ang * 7) * 6 + Math.exp(-ang * 40) * 22;

      const i = (y * W + x) * 4;
      data[i] = c.r + glow * 1.0;
      data[i + 1] = c.g + glow * 0.78;
      data[i + 2] = c.b + glow * 0.5;
      data[i + 3] = 1;
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export type EnvPath = "pmrem" | "equirect";

// Install the sky as scene IBL. Prefer PMREM (correct prefiltered irradiance and
// roughness-aware specular); fall back to the raw equirect if the PMREM path is
// not clean on this backend. Returns which path was taken so the UI can report it.
export function installEnvironment(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  sky: THREE.DataTexture
): EnvPath {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(sky);
    scene.environment = rt.texture;
    scene.environmentIntensity = 1.0;
    pmrem.dispose();
    return "pmrem";
  } catch {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = sky;
    scene.environmentIntensity = 1.0;
    return "equirect";
  }
}
