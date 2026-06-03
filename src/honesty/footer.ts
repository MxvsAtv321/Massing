import type { ConfidenceBreakdown } from "./confidence";

// The static slice of the sources manifest needed to render the export footer.
export type FooterSourcesSlice = {
  dataset: string;
  vintage: string;
  retrievedDate: string;
  license: string;
  accuracyDisclaimer: string;
  bandScopeNote: string;
};

export type FooterInput = FooterSourcesSlice & {
  breakdown: ConfidenceBreakdown;
  hypotheticalCount: number;
  torontoDateTimeStr: string;   // e.g. "2026-06-03 2:32 PM EDT"
  sunAltDeg: number;
  sunAzDeg: number;
  isUsable: boolean;
};

export function buildFooterLines(input: FooterInput): string[] {
  const {
    dataset, vintage, retrievedDate, license,
    accuracyDisclaimer, bandScopeNote,
    breakdown, hypotheticalCount,
    torontoDateTimeStr, sunAltDeg, sunAzDeg, isUsable,
  } = input;

  const lines: string[] = [];

  lines.push(`${dataset} (${vintage}) | Retrieved ${retrievedDate} | ${license}`);

  const disclaimer =
    accuracyDisclaimer.length > 120
      ? accuracyDisclaimer.slice(0, 117) + "..."
      : accuracyDisclaimer;
  lines.push(disclaimer);

  const confLine =
    `Height confidence: ${breakdown.measured} measured | ${breakdown.estimated} estimated` +
    (hypotheticalCount > 0 ? ` | ${hypotheticalCount} hypothetical` : "");
  lines.push(confLine);

  if (hypotheticalCount > 0) {
    const noun = hypotheticalCount === 1 ? "structure" : "structures";
    lines.push(`This view contains ${hypotheticalCount} hypothetical ${noun} you added.`);
  }

  const sunStr = isUsable
    ? `alt ${sunAltDeg.toFixed(1)}° az ${sunAzDeg.toFixed(1)}°`
    : "low sun / night";
  lines.push(`${torontoDateTimeStr} | Sun: ${sunStr}`);

  lines.push(
    "Not modeled: traffic change, displacement, property values, human movement, terrain, footprint error"
  );

  lines.push(bandScopeNote);

  return lines;
}
