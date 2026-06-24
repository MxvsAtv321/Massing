// Imperative live-daylight bridge. Lighting owns the day clock and writes the
// current day factor here every frame; canvas consumers (car head/tail lights now,
// window lights later) read it in their own useFrame to ramp emissive with dusk,
// without recomputing the sun or advancing the clock. Plain mutable module state,
// read every frame, never triggers a React render (cf. editRatios).
export const daylightLive = { dayFactor: 1 };
