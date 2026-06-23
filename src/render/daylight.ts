// Pure mapping from the sun's altitude to how the scene is lit and how the sky
// is coloured. Driven by the real altitude from the kept solar engine, so the
// look tracks the actual Toronto sun, but the palette itself is an art-directed
// choice (warm low sun, cool high sun, deep cool night). No THREE here so it is
// testable in node; the renderer consumes plain numbers.

export type Daylight = {
  color: [number, number, number]; // directional light tint, multiplier
  intensity: number; // directional light intensity
  ambient: number; // ambient fill intensity
  ambientColor: [number, number, number]; // ambient fill tint, cool at night
  dayFactor: number; // 0 night .. 1 full day
  isNight: boolean; // sun at or below the horizon
};

export type SkyGrade = {
  zenith: [number, number, number]; // top-of-dome colour, linear
  horizon: [number, number, number]; // horizon-band colour, linear
  ground: [number, number, number]; // below-horizon colour, linear
  glow: number; // multiplier on the sun halo and disk
  exposure: number; // overall sky brightness, dims toward night
};

const MAX_INTENSITY = 4.2;
// Day keeps a low ambient so the strong sun stays contrasty; night carries the
// whole scene on ambient (the sun is off), so it is a moonlit floor, not black.
const DAY_AMBIENT = 0.05;
const NIGHT_AMBIENT = 0.18;

// Warm horizon sun toward a cool white overhead sun.
const SUN_WARM: [number, number, number] = [1.0, 0.78, 0.52];
const SUN_NOON: [number, number, number] = [1.0, 0.97, 0.92];

// Ambient is cool blue moonlight at night, neutral by day.
const MOON_TINT: [number, number, number] = [0.5, 0.62, 1.0];
const NEUTRAL_TINT: [number, number, number] = [1.0, 1.0, 1.0];

export function daylightFor(altitudeDeg: number): Daylight {
  const dayFactor = clamp01(altitudeDeg / 12);
  const isNight = altitudeDeg <= 0;

  // Continuous through the horizon, but reaches full strength quickly (by ~12
  // degrees) so daylight has real punch and casts hard shadows; only the last few
  // degrees before the horizon dim into a warm, low dusk.
  const intensity = MAX_INTENSITY * smoothstep(clamp01(altitudeDeg / 12));

  const t = clamp01(altitudeDeg / 50);
  const color = lerp3(SUN_WARM, SUN_NOON, t);

  const ambient = lerp(NIGHT_AMBIENT, DAY_AMBIENT, dayFactor);
  const ambientColor = lerp3(MOON_TINT, NEUTRAL_TINT, dayFactor);

  return { color, intensity, ambient, ambientColor, dayFactor, isNight };
}

// Palette for the procedural sky, blended across night, twilight, and day by
// altitude so the dome shifts with the sun.
export function skyGradeFor(altitudeDeg: number): SkyGrade {
  const twilight = clamp01((altitudeDeg + 8) / 14); // 0 deep night .. 1 by ~6 deg
  const day = clamp01((altitudeDeg - 2) / 30); // 0 until ~2 deg .. 1 by ~32 deg

  const nightZenith: RGB = [0.03, 0.045, 0.11];
  const twilightZenith: RGB = [0.1, 0.12, 0.3];
  const dayZenith: RGB = [0.16, 0.3, 0.55];

  const nightHorizon: RGB = [0.04, 0.05, 0.12];
  const twilightHorizon: RGB = [1.0, 0.5, 0.28];
  const dayHorizon: RGB = [0.72, 0.8, 0.92];

  const zenith = lerp3(lerp3(nightZenith, twilightZenith, twilight), dayZenith, day);
  const horizon = lerp3(
    lerp3(nightHorizon, twilightHorizon, twilight),
    dayHorizon,
    day
  );
  const ground: RGB = [0.03, 0.03, 0.035];

  const glow = lerp(0.15, 0.7, twilight) * lerp(1.4, 1.0, day); // warm at dusk, calm at noon
  const exposure = lerp(0.22, 0.85, twilight); // deep night keeps a dim blue dome, not black

  return { zenith, horizon, ground, glow, exposure };
}

type RGB = [number, number, number];

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
