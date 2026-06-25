import type { RegionField } from "./studyTypes";

// Grade the sun-hours field into a heatmap (Unit 8, increment 8.4). Colours are baked
// CPU-side into an RGBA buffer for a DataTexture, so there is no reactive shader math:
// the region plane just samples the texture. A cool shadow blue rises to a warm
// sunlit gold, with alpha climbing as the sun does, so shadowed ground stays quiet and
// the lit park glows. Restrained by intent: the overlay serves the massing, the
// buildings stay the subject (see the spectacle note).

// Normalized sun-hours fraction (0 shadowed, 1 fully sunlit) -> RGBA in 0..1.
export function heatmapColor(t: number): [number, number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const cool: [number, number, number] = [0.1, 0.16, 0.4];
  const warm: [number, number, number] = [1.0, 0.78, 0.3];
  return [
    cool[0] + (warm[0] - cool[0]) * x,
    cool[1] + (warm[1] - cool[1]) * x,
    cool[2] + (warm[2] - cool[2]) * x,
    0.22 + (0.72 - 0.22) * x,
  ];
}

// Bake the field into an RGBA8 buffer, row-major to match the field rows, normalized
// by the window's max hours so a fully-sunlit texel reads full warm.
export function fieldToHeatmapData(field: RegionField): Uint8ClampedArray {
  const { width, height, hours, maxPossibleHours } = field;
  const data = new Uint8ClampedArray(width * height * 4);
  const inv = maxPossibleHours > 0 ? 1 / maxPossibleHours : 0;
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = heatmapColor(hours[i] * inv);
    data[i * 4] = r * 255;
    data[i * 4 + 1] = g * 255;
    data[i * 4 + 2] = b * 255;
    data[i * 4 + 3] = a * 255;
  }
  return data;
}
