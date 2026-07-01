// The canonical footprint geometry, deeply readonly so a visual change cannot mutate the geometry the
// scorers and the signature read (ADR-R29). Rings of [east, north] ENU points.
export type FootprintRing = readonly (readonly number[])[];
export type Footprint = readonly FootprintRing[];

export type Confidence =
  | { kind: "measured"; sigma_m: number }
  | { kind: "estimated"; sigma_m: number }
  | { kind: "hypothetical" };

export type Provenance<T> = {
  value: T;
  source: string;
  date: string;
  confidence: Confidence;
};

export type Building = {
  id: string;
  footprint: number[][][]; // rings of [east, north] ENU metres; outer ring then holes
  height: Provenance<number>;
  baseElevation: Provenance<number>;
  origin: "toronto-open-data" | "user-edit";
  clusterId: string;
  isTallestInCluster: boolean;
  heightSrc: string | null;  // raw HEIGHT_SRC field value from the dataset
};

export type ClusterIndexEntry = {
  clusterId: string;
  representativeHeight_m: number;
  memberIds: string[];
  tallestMemberId: string;
};

export type ArtifactFilter = {
  field: string;
  value: number;
  epsilon: number;
};

export type HeightAccuracyEntry =
  | { kind: "measured"; sigma_m: number; citation?: string; note?: string }
  | { kind: "estimated"; sigma_m: number; citation?: string; note?: string };

export type SourceManifest = {
  cityId: string; // canonical city id, equals the data/cities/<id>/ folder name
  displayName: string; // human-readable place name for UI and agent prompts
  dataset: string;
  datasetUrl: string;
  license: string;
  vintage: string;
  retrievedDate: string;
  sourceCrs: string;
  accuracyDisclaimer: string;
  heightField: string;
  groundField: string;
  heightMslField: string;
  artifactFilter: ArtifactFilter;
  sourceField: string | null;
  heightAccuracyBySource: Record<string, HeightAccuracyEntry>;
  defaultHeightAccuracy: HeightAccuracyEntry;
  metresPerStorey: number;
  ianaZone: string; // per-city IANA time zone for the solar clock, e.g. "America/Toronto"
  bandScopeNote: string;
};

export type CoverageStats = {
  included: number;
  excludedMissingHeight: number;
  excludedInvalidGeometry: number;
  excludedArtifact: number;
  heightMslMismatches: number;
  heightMslUnpopulated: number;
};

export type CityModel = {
  originLatLon: [number, number];
  crsNote: string;
  buildings: Building[];
  clusters: Record<string, ClusterIndexEntry>;
  sources: SourceManifest;
  coverage: CoverageStats;
};
