"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, {
  type ExpressionSpecification,
  type FillLayerSpecification,
  type LineLayerSpecification,
  type MapLayerMouseEvent,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, MapPin, RefreshCw, Search, X } from "lucide-react";
import { format } from "date-fns";
import { useTheme } from "next-themes";
import { ENROLLMENT_LEVELS, formatEnrollment, type EnrollmentLevelId } from "@/lib/peer/enrollment-levels";
import { SUPPORTED_ENROLLMENT_YEARS, DEFAULT_ENROLLMENT_YEAR } from "@/lib/leaderboard/constants";
import { NATIONAL_STATE_CODE, NATIONAL_STATE_NAME, US_STATE_NAMES } from "@/lib/leaderboard/states";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { ExportCsvButton } from "@/components/data-browser/ExportCsvButton";
import { DEFAULT_TABLE, type TableConfig, type TableColumnConfig } from "@/lib/data-browser/config";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35, zoom: 4.2 };

type StateOption = {
  code: string;
  name: string;
  contractCount: number;
  totalEnrollment: number | null;
  formattedEnrollment: string;
  averageStarRating: number | null;
  contractsWithStars: number;
  measure?: {
    average: number | null;
    unit: string | null;
    valueType: MeasureValueType;
    contractsWithMeasure: number;
  };
};

type MapContractResponse = import("@/app/api/maps/contracts/route").MapContractResponse;

type ContractSelection = {
  planTypeGroup: MapContractResponse["filters"]["planTypeGroup"];
  contractSeries: MapContractResponse["filters"]["contractSeries"];
  enrollmentLevel: MapContractResponse["filters"]["enrollmentLevel"];
  blueOnly: boolean;
};

type FetchState = "idle" | "loading" | "loaded" | "error";

type MeasureValueType = "percent" | "star" | "numeric";

type MeasureOption = {
  code: string;
  name: string;
  domain: string | null;
  weight: number | null;
  latestYear: number | null;
};

type StatesMeasureMeta = {
  code: string;
  name: string;
  unit: string | null;
  valueType: MeasureValueType;
  latestYear: number | null;
  contractsWithData: number;
  stats: {
    count: number;
    average: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
    q1: number | null;
    q3: number | null;
  } | null;
} | null;

const MEASURE_COLOR_SCALE = [
  "#edf8fb",
  "#bfd3e6",
  "#9ebcda",
  "#8c96c6",
  "#8856a7",
  "#810f7c",
];

type ValueRange = {
  min: number;
  max: number;
};

const STATE_CENTROIDS: Record<string, { lat: number; lng: number; zoom: number }> = {
  AL: { lat: 32.806671, lng: -86.79113, zoom: 5.8 },
  AK: { lat: 64.20084, lng: -149.49367, zoom: 3.5 },
  AZ: { lat: 34.048928, lng: -111.093731, zoom: 5.3 },
  AR: { lat: 34.969704, lng: -92.373123, zoom: 6 },
  CA: { lat: 36.778259, lng: -119.417931, zoom: 5 },
  CO: { lat: 39.550051, lng: -105.782067, zoom: 5.4 },
  CT: { lat: 41.603221, lng: -73.087749, zoom: 6.7 },
  DE: { lat: 38.910832, lng: -75.52767, zoom: 7.2 },
  FL: { lat: 27.664827, lng: -81.515754, zoom: 5.3 },
  GA: { lat: 32.165622, lng: -82.900075, zoom: 5.7 },
  HI: { lat: 19.896766, lng: -155.582782, zoom: 5.3 },
  ID: { lat: 44.068202, lng: -114.742041, zoom: 5.1 },
  IL: { lat: 40.633125, lng: -89.398528, zoom: 5.8 },
  IN: { lat: 40.551217, lng: -85.602364, zoom: 5.9 },
  IA: { lat: 41.878003, lng: -93.097702, zoom: 5.8 },
  KS: { lat: 39.011902, lng: -98.484246, zoom: 5.6 },
  KY: { lat: 37.839333, lng: -84.270018, zoom: 5.9 },
  LA: { lat: 31.244823, lng: -92.145024, zoom: 5.6 },
  ME: { lat: 45.253783, lng: -69.445469, zoom: 5.5 },
  MD: { lat: 39.045755, lng: -76.641271, zoom: 6.2 },
  MA: { lat: 42.407211, lng: -71.382439, zoom: 6.5 },
  MI: { lat: 44.314844, lng: -85.602364, zoom: 5.3 },
  MN: { lat: 46.729553, lng: -94.6859, zoom: 5.4 },
  MS: { lat: 32.354668, lng: -89.398528, zoom: 5.8 },
  MO: { lat: 37.964253, lng: -91.831833, zoom: 5.6 },
  MT: { lat: 46.879682, lng: -110.362566, zoom: 4.6 },
  NE: { lat: 41.492537, lng: -99.901813, zoom: 5.4 },
  NV: { lat: 38.80261, lng: -116.419389, zoom: 5.1 },
  NH: { lat: 43.193852, lng: -71.572395, zoom: 6.7 },
  NJ: { lat: 40.058324, lng: -74.405661, zoom: 6.5 },
  NM: { lat: 34.51994, lng: -105.87009, zoom: 5.2 },
  NY: { lat: 43.299428, lng: -74.217933, zoom: 5.2 },
  NC: { lat: 35.759573, lng: -79.0193, zoom: 5.5 },
  ND: { lat: 47.551493, lng: -101.002012, zoom: 5.5 },
  OH: { lat: 40.417287, lng: -82.907123, zoom: 5.6 },
  OK: { lat: 35.007752, lng: -97.092877, zoom: 5.6 },
  OR: { lat: 43.804133, lng: -120.554201, zoom: 5.3 },
  PA: { lat: 41.203322, lng: -77.194525, zoom: 5.5 },
  RI: { lat: 41.580095, lng: -71.477429, zoom: 7.2 },
  SC: { lat: 33.836081, lng: -81.163725, zoom: 5.8 },
  SD: { lat: 43.969515, lng: -99.901813, zoom: 5.4 },
  TN: { lat: 35.517491, lng: -86.580447, zoom: 5.7 },
  TX: { lat: 31.968599, lng: -99.901813, zoom: 5 },
  UT: { lat: 39.32098, lng: -111.093731, zoom: 5.3 },
  VT: { lat: 44.558803, lng: -72.577841, zoom: 6.5 },
  VA: { lat: 37.431573, lng: -78.656894, zoom: 5.6 },
  WA: { lat: 47.751074, lng: -120.740139, zoom: 5.2 },
  WV: { lat: 38.597626, lng: -80.454903, zoom: 5.9 },
  WI: { lat: 43.78444, lng: -88.787868, zoom: 5.4 },
  WY: { lat: 43.075968, lng: -107.290284, zoom: 5.2 },
  DC: { lat: 38.9072, lng: -77.0369, zoom: 7.2 },
};

const PLAN_TYPE_OPTIONS: Array<{
  id: ContractSelection["planTypeGroup"];
  label: string;
}> = [
  { id: "ALL", label: "All plan types" },
  { id: "SNP", label: "Special Needs (SNP)" },
  { id: "NOT", label: "Non-SNP" },
];

const CONTRACT_SERIES_OPTIONS: Array<{
  id: ContractSelection["contractSeries"];
  label: string;
}> = [
  { id: "H_ONLY", label: "H-Series" },
  { id: "S_ONLY", label: "S-Series" },
];

const ENROLLMENT_OPTIONS = ENROLLMENT_LEVELS.filter((bucket) => bucket.id !== "null").map((bucket) => ({
  id: bucket.id as EnrollmentLevelId,
  label: bucket.label,
}));

const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";

const STATES_SOURCE_ID = "us-states-polygons" as const;
const STATES_FILL_LAYER_ID = "us-states-fill" as const;
const STATES_OUTLINE_LAYER_ID = "us-states-outline" as const;

const STATE_POLYGONS_URL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json" as const;

const STAR_COLORS: Array<{ threshold: number; color: string }> = [
  { threshold: 4.5, color: "#0f9d58" },
  { threshold: 4.0, color: "#34a853" },
  { threshold: 3.5, color: "#7cb342" },
  { threshold: 3.0, color: "#c0ca33" },
  { threshold: 2.5, color: "#fdd835" },
  { threshold: 2.0, color: "#fbbc04" },
  { threshold: 1.5, color: "#f4511e" },
  { threshold: 1.0, color: "#d32f2f" },
  { threshold: 0, color: "#b71c1c" },
];

const STATE_NAME_TO_CODE = Object.entries(US_STATE_NAMES).reduce<Record<string, string>>((acc, [code, name]) => {
  acc[name.toLowerCase()] = code;
  return acc;
}, {});

type StatePolygonFeature = Feature<
  Polygon | MultiPolygon,
  Record<string, unknown> & {
    stateCode: string;
    stateName: string;
  }
>;

type StatePolygonCollection = FeatureCollection<StatePolygonFeature["geometry"], StatePolygonFeature["properties"]>;

function resolveStateCode(properties: Record<string, unknown> | undefined): string | null {
  if (!properties) return null;
  const stringProps = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>;

  const codeCandidates = [
    stringProps.postal,
    stringProps.postal_abbr,
    stringProps.code,
    stringProps.state_code,
    stringProps.STATE_ABBR,
    stringProps.state_abbr,
    stringProps.STUSPS,
    stringProps.stusps,
  ];

  for (const candidate of codeCandidates) {
    if (!candidate) continue;
    const normalized = candidate.trim().toUpperCase();
    if (STATE_CENTROIDS[normalized]) {
      return normalized;
    }
  }

  const nameCandidates = [
    stringProps.name,
    stringProps.NAME,
    stringProps.state,
    stringProps.State,
    stringProps.STATE_NAME,
    stringProps.state_name,
  ];

  for (const candidate of nameCandidates) {
    if (!candidate) continue;
    const code = STATE_NAME_TO_CODE[candidate.trim().toLowerCase()];
    if (code && STATE_CENTROIDS[code]) {
      return code;
    }
  }

  return null;
}

function colorForRating(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "#9ca3af";
  }
  for (const entry of STAR_COLORS) {
    if (value >= entry.threshold) {
      return entry.color;
    }
  }
  return STAR_COLORS[STAR_COLORS.length - 1]?.color ?? "#9ca3af";
}

function colorForMeasure(value: number | null | undefined, range: ValueRange | null): string {
  if (value === null || value === undefined || !Number.isFinite(value) || !range) {
    return "#9ca3af";
  }
  const { min, max } = range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min <= 0) {
    return MEASURE_COLOR_SCALE[MEASURE_COLOR_SCALE.length - 1] ?? "#8856a7";
  }
  const clamped = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const scaled = clamped * (MEASURE_COLOR_SCALE.length - 1);
  const index = Math.min(MEASURE_COLOR_SCALE.length - 1, Math.round(scaled));
  return MEASURE_COLOR_SCALE[index] ?? "#9ca3af";
}

function formatMeasureValue(
  value: number | null,
  valueType: MeasureValueType,
  unit: string | null
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  switch (valueType) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "star":
      return value.toFixed(2);
    default: {
      if (unit && unit !== "%") {
        return `${NUMBER_FORMATTER.format(value)} ${unit}`;
      }
      if (unit === "%") {
        return `${value.toFixed(1)}%`;
      }
      return NUMBER_FORMATTER.format(value);
    }
  }
}

function buildMeasureLegendStops(range: ValueRange | null, valueType: MeasureValueType, unit: string | null) {
  if (!range) {
    return [] as Array<{ color: string; label: string }>;
  }
  const stops: Array<{ color: string; label: string }> = [];
  const steps = MEASURE_COLOR_SCALE.length;
  if (steps === 0) {
    return stops;
  }
  const { min, max } = range;
  const delta = steps > 1 ? (max - min) / (steps - 1) : 0;
  for (let index = 0; index < steps; index += 1) {
    const value = min + delta * index;
    const color = MEASURE_COLOR_SCALE[index];
    stops.push({
      color,
      label: formatMeasureValue(value, valueType, unit),
    });
  }
  return stops;
}

export function ContractsMapExplorer() {
  const { theme } = useTheme();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesFetchState, setStatesFetchState] = useState<FetchState>("idle");
  const [stateFetchError, setStateFetchError] = useState<string | null>(null);
  const [statePolygons, setStatePolygons] = useState<StatePolygonCollection | null>(null);

  const [selection, setSelection] = useState<ContractSelection>({
    planTypeGroup: "ALL",
    contractSeries: "H_ONLY",
    enrollmentLevel: "all",
    blueOnly: false,
  });
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_ENROLLMENT_YEAR);
  const [selectedState, setSelectedState] = useState<string>(NATIONAL_STATE_CODE);
  const [targetContractId, setTargetContractId] = useState<string>("");
  const [contractSearchQuery, setContractSearchQuery] = useState<string>("");
  const [isContractDropdownOpen, setIsContractDropdownOpen] = useState<boolean>(false);
  const [selectedMeasure, setSelectedMeasure] = useState<string>("");
  const contractDropdownRef = useRef<HTMLDivElement | null>(null);
  const [measureOptions, setMeasureOptions] = useState<MeasureOption[]>([]);
  const [measureOptionsFetchState, setMeasureOptionsFetchState] = useState<FetchState>("idle");
  const [measureOptionsError, setMeasureOptionsError] = useState<string | null>(null);
  const [statesMeasureMeta, setStatesMeasureMeta] = useState<StatesMeasureMeta>(null);

  const [dataFetchState, setDataFetchState] = useState<FetchState>("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [payload, setPayload] = useState<MapContractResponse | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const selectedStateRef = useRef(selectedState);
  const stateLookupRef = useRef<Map<string, StateOption>>(new Map());

  useEffect(() => {
    selectedStateRef.current = selectedState;
  }, [selectedState]);

  useEffect(() => {
    let isActive = true;

    async function loadPolygons() {
      try {
        const response = await fetch(STATE_POLYGONS_URL);
        if (!response.ok) {
          throw new Error(`Failed to load state polygons (${response.status})`);
        }
        const raw = (await response.json()) as FeatureCollection<
          Polygon | MultiPolygon,
          Record<string, unknown>
        >;

        const normalizedFeatures = raw.features
          .map((feature) => {
            const stateCode = resolveStateCode(feature.properties);
            if (!stateCode) {
              return null;
            }

            const properties = {
              ...feature.properties,
              stateCode,
              stateName: US_STATE_NAMES[stateCode],
            };

            return {
              type: "Feature" as const,
              geometry: feature.geometry,
              properties,
            } satisfies StatePolygonFeature;
          })
          .filter((feature): feature is StatePolygonFeature => Boolean(feature));

        if (!normalizedFeatures.length) {
          throw new Error("No usable state polygons were loaded");
        }

        if (isActive) {
          setStatePolygons({
            type: "FeatureCollection",
            features: normalizedFeatures,
          });
        }
      } catch (error) {
        console.error("Failed to load US state polygons", error);
      }
    }

    loadPolygons();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadMeasureOptions() {
      setMeasureOptionsFetchState("loading");
      setMeasureOptionsError(null);
      try {
        const response = await fetch("/api/maps/measures");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to load measures");
        }

        const payload = (await response.json()) as { measures: MeasureOption[] };
        if (!isActive) return;

        const sorted = (payload.measures ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
        setMeasureOptions(sorted);
        setMeasureOptionsFetchState("loaded");
      } catch (error) {
        console.error("Measure options load failure", error);
        if (!isActive) return;
        setMeasureOptionsError(error instanceof Error ? error.message : "Failed to load measures");
        setMeasureOptionsFetchState("error");
      }
    }

    loadMeasureOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const lookup = new Map<string, StateOption>();
    for (const state of states) {
      lookup.set(state.code, state);
    }
    stateLookupRef.current = lookup;
  }, [states]);

  const stateMeasureRange = useMemo<ValueRange | null>(() => {
    if (!selectedMeasure || !statesMeasureMeta?.stats || !statesMeasureMeta.stats.count) {
      return null;
    }
    const { min, max } = statesMeasureMeta.stats;
    if (min === null || max === null) {
      return null;
    }
    return { min, max };
  }, [selectedMeasure, statesMeasureMeta]);

  const currentMeasureSummary = useMemo(() => payload?.measure?.summary ?? null, [payload]);

  const stateLegendStops = useMemo(() => {
    if (!selectedMeasure || !statesMeasureMeta || !stateMeasureRange) {
      return null;
    }
    return buildMeasureLegendStops(stateMeasureRange, statesMeasureMeta.valueType, statesMeasureMeta.unit ?? null);
  }, [selectedMeasure, statesMeasureMeta, stateMeasureRange]);

  const mapLegendTitle = useMemo(() => {
    if (selectedMeasure) {
      if (statesMeasureMeta) {
        return `${statesMeasureMeta.name}${statesMeasureMeta.unit ? ` (${statesMeasureMeta.unit})` : ""}`;
      }
      if (currentMeasureSummary) {
        return `${currentMeasureSummary.name}${currentMeasureSummary.unit ? ` (${currentMeasureSummary.unit})` : ""}`;
      }
      return "Selected measure";
    }
    return "Average Star Rating";
  }, [selectedMeasure, statesMeasureMeta, currentMeasureSummary]);

  const stateColorExpression = useMemo<ExpressionSpecification>(() => {
    const expression: unknown[] = ["match", ["get", "stateCode"]];
    for (const state of states) {
      if (selectedMeasure && stateMeasureRange && state.measure && typeof state.measure.average === "number") {
        expression.push(state.code, colorForMeasure(state.measure.average, stateMeasureRange));
      } else {
        expression.push(state.code, colorForRating(state.averageStarRating));
      }
    }
    expression.push("#9ca3af");
    return expression as ExpressionSpecification;
  }, [states, selectedMeasure, stateMeasureRange]);

  const fillOpacityExpression = useMemo<ExpressionSpecification>(() => {
    const baseOpacity: unknown[] = ["match", ["get", "stateCode"]];
    for (const state of states) {
      const hasRating = state.averageStarRating !== null && Number.isFinite(state.averageStarRating);
      const measureAverage = state.measure?.average;
      const hasMeasure =
        Boolean(selectedMeasure && stateMeasureRange) &&
        typeof measureAverage === "number" &&
        Number.isFinite(measureAverage);
      baseOpacity.push(state.code, hasMeasure ? 0.8 : hasRating ? 0.75 : 0.25);
    }
    baseOpacity.push(0.15);

    const expression: unknown[] = [
      "case",
      ["==", ["get", "stateCode"], selectedState ?? ""],
      0.95,
      baseOpacity,
    ];
    return expression as ExpressionSpecification;
  }, [states, selectedState, selectedMeasure, stateMeasureRange]);

  const outlineColorExpression = useMemo<ExpressionSpecification>(() => {
    const expression: unknown[] = [
      "case",
      ["==", ["get", "stateCode"], selectedState ?? ""],
      "#1d4ed8",
      "rgba(255, 255, 255, 0.75)",
    ];
    return expression as ExpressionSpecification;
  }, [selectedState]);

  const outlineWidthExpression = useMemo<ExpressionSpecification>(() => {
    const expression: unknown[] = [
      "case",
      ["==", ["get", "stateCode"], selectedState ?? ""],
      2.5,
      1.25,
    ];
    return expression as ExpressionSpecification;
  }, [selectedState]);

  const initialCenterRef = useRef(DEFAULT_CENTER);
  const stateFilterParams = useMemo(
    () => ({
      planTypeGroup: selection.planTypeGroup,
      contractSeries: selection.contractSeries,
      enrollmentLevel: selection.enrollmentLevel,
      blueOnly: selection.blueOnly,
      year: selectedYear,
    }),
    [selection.planTypeGroup, selection.contractSeries, selection.enrollmentLevel, selection.blueOnly, selectedYear]
  );

  useEffect(() => {
    let isActive = true;

    async function loadStates() {
      setStatesFetchState("loading");
      setStateFetchError(null);
      if (!selectedMeasure) {
        setStatesMeasureMeta(null);
      }
      try {
        const params = new URLSearchParams();
        if (selectedMeasure) {
          params.set("measure", selectedMeasure);
        }
        if (stateFilterParams.blueOnly) {
          params.set("blueOnly", "true");
        }
        params.set("planTypeGroup", stateFilterParams.planTypeGroup);
        params.set("contractSeries", stateFilterParams.contractSeries);
        params.set("enrollmentLevel", stateFilterParams.enrollmentLevel);
        params.set("year", stateFilterParams.year.toString());
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(`/api/leaderboard/states${query}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to load states");
        }
        const payload = (await response.json()) as {
          states: Array<{
            code: string;
            totalEnrollment: number | null;
            formattedEnrollment: string;
            contractCount: number;
            averageStarRating: number | null;
            contractsWithStars: number;
            measure?: {
              average: number | null;
              unit: string | null;
              valueType: MeasureValueType;
              contractsWithMeasure: number;
            };
          }>;
          measure: StatesMeasureMeta;
        };

        if (!isActive) return;

        const allStates = Object.entries(STATE_CENTROIDS).map(([code]) => {
          const existing = payload.states?.find((state) => state.code === code);
          const measure = selectedMeasure && existing?.measure
            ? {
                average: existing.measure.average ?? null,
                unit: existing.measure.unit ?? null,
                valueType: existing.measure.valueType,
                contractsWithMeasure: existing.measure.contractsWithMeasure ?? 0,
              }
            : undefined;
          return {
            code,
            name: US_STATE_NAMES[code] ?? code,
            contractCount: existing?.contractCount ?? 0,
            totalEnrollment: existing?.totalEnrollment ?? null,
            formattedEnrollment:
              existing?.formattedEnrollment ?? formatEnrollment(existing?.totalEnrollment ?? null),
            averageStarRating: existing?.averageStarRating ?? null,
            contractsWithStars: existing?.contractsWithStars ?? 0,
            measure,
          } satisfies StateOption;
        });

        const sorted = allStates.sort((a, b) => a.name.localeCompare(b.name));

        const nationalOption = (() => {
          const totalContracts = (payload.states ?? []).reduce((sum, state) => sum + state.contractCount, 0);
          const enrollmentSum = (payload.states ?? []).reduce(
            (sum, state) => sum + (state.totalEnrollment ?? 0),
            0
          );
          const hasEnrollment = (payload.states ?? []).some(
            (state) => typeof state.totalEnrollment === "number" && state.totalEnrollment > 0
          );
          const totalContractsWithStars = (payload.states ?? []).reduce(
            (sum, state) => sum + (state.contractsWithStars ?? 0),
            0
          );
          const starSum = (payload.states ?? []).reduce((sum, state) => {
            if (typeof state.averageStarRating === "number" && Number.isFinite(state.averageStarRating)) {
              return sum + state.averageStarRating * (state.contractsWithStars ?? 0);
            }
            return sum;
          }, 0);
          const averageStarRating = totalContractsWithStars
            ? starSum / totalContractsWithStars
            : null;

          const measureTotals = (payload.states ?? []).reduce(
            (acc, state) => {
              if (!state.measure || state.measure.average === null || !Number.isFinite(state.measure.average)) {
                return acc;
              }
              const count = state.measure.contractsWithMeasure ?? 0;
              if (count <= 0) {
                return acc;
              }
              acc.total += state.measure.average * count;
              acc.count += count;
              return acc;
            },
            { total: 0, count: 0 }
          );

          const nationalMeasure = selectedMeasure
            ? {
                average: measureTotals.count ? measureTotals.total / measureTotals.count : null,
                unit: payload.measure?.unit ?? null,
                valueType: payload.measure?.valueType ?? "numeric",
                contractsWithMeasure: measureTotals.count,
              }
            : undefined;

          const totalEnrollment = hasEnrollment ? enrollmentSum : null;

          return {
            code: NATIONAL_STATE_CODE,
            name: NATIONAL_STATE_NAME,
            contractCount: totalContracts,
            totalEnrollment,
            formattedEnrollment: formatEnrollment(totalEnrollment),
            averageStarRating,
            contractsWithStars: totalContractsWithStars,
            measure: nationalMeasure,
          } satisfies StateOption;
        })();

        const nextStates = [nationalOption, ...sorted];
        setStates(nextStates);
        setSelectedState((prev) => {
          if (prev && nextStates.some((state) => state.code === prev)) {
            return prev;
          }
          return NATIONAL_STATE_CODE;
        });
        setStatesMeasureMeta(selectedMeasure ? payload.measure ?? null : null);
        setStatesFetchState("loaded");
      } catch (error) {
        console.error("State load failure", error);
        if (!isActive) return;
        setStateFetchError(error instanceof Error ? error.message : "Failed to load states");
        setStatesFetchState("error");
      }
    }

    loadStates();

    return () => {
      isActive = false;
    };
  }, [selectedMeasure, stateFilterParams]);

  const fetchData = useCallback(async () => {
    if (!selectedState) return;
    setDataFetchState("loading");
    setDataError(null);

    const params = new URLSearchParams({
      state: selectedState,
      planTypeGroup: selection.planTypeGroup,
      contractSeries: selection.contractSeries,
      enrollmentLevel: selection.enrollmentLevel,
    });

    if (selection.blueOnly) {
      params.set("blueOnly", "true");
    }
    if (targetContractId) {
      params.set("contractId", targetContractId);
    }
    if (selectedMeasure) {
      params.set("measure", selectedMeasure);
    }
    params.set("year", selectedYear.toString());

    try {
      const response = await fetch(`/api/maps/contracts?${params.toString()}`);
      if (response.status === 404) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.error === "string" && payload.error.trim()
          ? payload.error
          : "No contracts match the requested filters";
        setPayload(null);
        setDataError(message);
        setDataFetchState("loaded");
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to generate map data");
      }
      const json = (await response.json()) as MapContractResponse;
      setPayload(json);
      if (json.targetContract?.contractId && json.targetContract.contractId !== targetContractId) {
        setTargetContractId(json.targetContract.contractId);
      }
      setDataFetchState("loaded");
    } catch (error) {
      console.error("Map data fetch failed", error);
      setPayload(null);
      setDataError(error instanceof Error ? error.message : "Failed to generate map data");
      setDataFetchState("error");
    }
  }, [
    selectedState,
    selection.planTypeGroup,
    selection.contractSeries,
    selection.enrollmentLevel,
    selection.blueOnly,
    targetContractId,
    selectedMeasure,
    selectedYear,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current || !mapboxgl.accessToken) {
      return;
    }

    const { lat, lng, zoom } = initialCenterRef.current;
    const mapStyle = theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
    const map = new mapboxgl.Map({
      container,
      style: mapStyle,
      center: [lng, lat],
      zoom,
    });

    const navigation = new mapboxgl.NavigationControl({ visualizePitch: true });
    map.addControl(navigation, "top-right");

    map.on("load", () => {
      setMapLoaded(true);
    });

    popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "280px" });
    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !states.length || !statePolygons) {
      return;
    }
    if (!map.getSource(STATES_SOURCE_ID)) {
      map.addSource(STATES_SOURCE_ID, {
        type: "geojson",
        data: statePolygons,
      });
    } else {
      const source = map.getSource(STATES_SOURCE_ID) as mapboxgl.GeoJSONSource;
      source.setData(statePolygons);
    }

    if (!map.getLayer(STATES_FILL_LAYER_ID)) {
      const fillLayer: FillLayerSpecification = {
        id: STATES_FILL_LAYER_ID,
        type: "fill",
        source: STATES_SOURCE_ID,
        paint: {
          "fill-color": stateColorExpression,
          "fill-opacity": fillOpacityExpression,
        },
      };
      map.addLayer(fillLayer, "admin-1-boundary-bg");
    } else {
      map.setPaintProperty(STATES_FILL_LAYER_ID, "fill-color", stateColorExpression);
      map.setPaintProperty(STATES_FILL_LAYER_ID, "fill-opacity", fillOpacityExpression);
    }

    if (!map.getLayer(STATES_OUTLINE_LAYER_ID)) {
      const outlineLayer: LineLayerSpecification = {
        id: STATES_OUTLINE_LAYER_ID,
        type: "line",
        source: STATES_SOURCE_ID,
        paint: {
          "line-color": outlineColorExpression,
          "line-width": outlineWidthExpression,
          "line-opacity": 0.9,
        },
      };
      map.addLayer(outlineLayer, "admin-1-boundary-bg");
    } else {
      map.setPaintProperty(STATES_OUTLINE_LAYER_ID, "line-color", outlineColorExpression);
      map.setPaintProperty(STATES_OUTLINE_LAYER_ID, "line-width", outlineWidthExpression);
    }
  }, [mapLoaded, states, statePolygons, stateColorExpression, fillOpacityExpression, outlineColorExpression, outlineWidthExpression]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer(STATES_FILL_LAYER_ID)) {
      return;
    }

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const stateCode = feature?.properties?.stateCode as string | undefined;
      if (!stateCode || !STATE_CENTROIDS[stateCode]) {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
        return;
      }

      map.getCanvas().style.cursor = "pointer";
      const popup = popupRef.current;
      if (!popup) return;

      const stateInfo = stateLookupRef.current.get(stateCode);
      const displayName = stateInfo?.name ?? US_STATE_NAMES[stateCode] ?? stateCode;
      const contractCount = stateInfo?.contractCount ?? 0;
      const enrollmentText = stateInfo?.formattedEnrollment ?? "Enrollment N/A";
      const hasRating =
        typeof stateInfo?.averageStarRating === "number" && Number.isFinite(stateInfo.averageStarRating);
      const starRating = hasRating ? stateInfo!.averageStarRating!.toFixed(2) : "N/A";
      const contractsWithStars = stateInfo?.contractsWithStars ?? 0;
      const measureHtml = (() => {
        if (!selectedMeasure || !stateInfo?.measure) {
          return "";
        }
        const average = stateInfo.measure.average;
        if (average === null || !Number.isFinite(average)) {
          return "";
        }
        const unit = stateInfo.measure.unit ?? statesMeasureMeta?.unit ?? currentMeasureSummary?.unit ?? null;
        const formatted = formatMeasureValue(average, stateInfo.measure.valueType, unit);
        return `<div class="text-muted-foreground">Measure: ${formatted} (${stateInfo.measure.contractsWithMeasure.toLocaleString()} with data)</div>`;
      })();

      const html = `<div class="space-y-1 text-[12px]">
          <div class="text-[13px] font-medium text-foreground">${displayName}</div>
          <div class="text-muted-foreground">Contracts: ${contractCount.toLocaleString()}</div>
          <div class="text-muted-foreground">Enrollment: ${enrollmentText}</div>
          <div class="text-muted-foreground">Avg Stars: ${starRating} (${contractsWithStars} with ratings)</div>
          ${measureHtml}
        </div>`;

      popup.setLngLat(event.lngLat).setHTML(html).addTo(map);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const stateCode = feature?.properties?.stateCode as string | undefined;
      if (!stateCode || !STATE_CENTROIDS[stateCode]) {
        return;
      }

      setPayload(null);
      setSelectedState(stateCode);
    };

    map.on("mousemove", STATES_FILL_LAYER_ID, handleMouseMove);
    map.on("mouseleave", STATES_FILL_LAYER_ID, handleMouseLeave);
    map.on("click", STATES_FILL_LAYER_ID, handleClick);

    return () => {
      map.off("mousemove", STATES_FILL_LAYER_ID, handleMouseMove);
      map.off("mouseleave", STATES_FILL_LAYER_ID, handleMouseLeave);
      map.off("click", STATES_FILL_LAYER_ID, handleClick);
    };
  }, [mapLoaded, selectedMeasure, statesMeasureMeta, currentMeasureSummary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedState) {
      return;
    }

    const centroid = STATE_CENTROIDS[selectedState];
    if (centroid) {
      map.flyTo({ center: [centroid.lng, centroid.lat] as [number, number], zoom: centroid.zoom, speed: 0.8 });
      return;
    }

    map.flyTo({ center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: DEFAULT_CENTER.zoom, speed: 0.8 });
  }, [mapLoaded, selectedState]);

  const contractOptions = useMemo(() => {
    if (!payload?.contracts) return [] as Array<{ value: string; label: string }>;
    return payload.contracts.map((contract) => ({
      value: contract.contractId,
      label: `${contract.contractId} • ${contract.label}`,
    }));
  }, [payload]);

  const filteredContractOptions = useMemo(() => {
    if (!contractSearchQuery.trim()) return contractOptions;
    const query = contractSearchQuery.toLowerCase();
    return contractOptions.filter(
      (option) =>
        option.value.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query)
    );
  }, [contractOptions, contractSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contractDropdownRef.current &&
        !contractDropdownRef.current.contains(event.target as Node)
      ) {
        setIsContractDropdownOpen(false);
      }
    };

    if (isContractDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isContractDropdownOpen]);

  const targetContract = payload?.targetContract;

  const cohortStats = useMemo(() => {
    if (!payload) return null;
    const stats = [
      {
        key: "overall",
        title: "Overall Star Rating",
        stats: payload.cohort.overall,
      },
      {
        key: "partC",
        title: "Part C Rating",
        stats: payload.cohort.partC,
      },
      {
        key: "partD",
        title: "Part D Rating",
        stats: payload.cohort.partD,
      },
    ];

    if (currentMeasureSummary) {
      stats.unshift({
        key: "measure",
        title: `${currentMeasureSummary.name} (${currentMeasureSummary.code})`,
        stats: currentMeasureSummary.stats,
      });
    }

    return stats;
  }, [payload, currentMeasureSummary]);

  const formatNumber = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "—";
    return NUMBER_FORMATTER.format(value);
  }, []);

  const formatCsvNumber = useCallback(
    (value: number | null) => {
      const formatted = formatNumber(value);
      return formatted === "—" ? "" : formatted;
    },
    [formatNumber]
  );

  const csvColumns = useMemo<TableColumnConfig[]>(() => {
    const baseColumns: TableColumnConfig[] = [
      { key: "contractId", label: "Contract ID" },
      { key: "contractName", label: "Contract Name" },
      { key: "parentOrganization", label: "Parent Organization" },
      { key: "totalEnrollment", label: "Enrollment" },
      { key: "overall", label: "Overall" },
      { key: "overallDelta", label: "Overall Δ" },
      { key: "partC", label: "Part C" },
      { key: "partD", label: "Part D" },
    ];

    if (selectedMeasure && payload?.measure?.summary) {
      const label = `${payload.measure.summary.name}${payload.measure.summary.unit ? ` (${payload.measure.summary.unit})` : ""}`;
      baseColumns.push({ key: "measureValue", label });
    }

    return baseColumns;
  }, [selectedMeasure, payload?.measure?.summary]);

  const csvConfig = useMemo<TableConfig>(
    () => ({
      name: DEFAULT_TABLE,
      label: "Contracts Map Export",
      description: "Peer comparison export generated from Contracts Map Explorer",
      columns: csvColumns,
      searchableColumns: [],
    }),
    [csvColumns]
  );

  const csvRows = useMemo<Record<string, unknown>[]>(() => {
    if (!payload) return [];

    const fallbackMeasureUnit = payload.measure?.summary?.unit ?? null;

    return payload.contracts.map((contract) => {
      const row: Record<string, unknown> = {
        contractId: contract.contractId,
        contractName: contract.label,
        parentOrganization: contract.parentOrganization ?? "",
        totalEnrollment:
          typeof contract.totalEnrollment === "number" && Number.isFinite(contract.totalEnrollment)
            ? contract.totalEnrollment
            : "",
        overall: formatCsvNumber(contract.metrics.overall.current),
        overallDelta: formatCsvNumber(contract.metrics.overall.delta),
        partC: formatCsvNumber(contract.metrics.partC.current),
        partD: formatCsvNumber(contract.metrics.partD.current),
      };

      if (selectedMeasure && csvColumns.some((column) => column.key === "measureValue")) {
        if (contract.measure && contract.measure.value !== null && Number.isFinite(contract.measure.value)) {
          const measureUnit = contract.measure.unit ?? fallbackMeasureUnit;
          const formattedMeasure = formatMeasureValue(contract.measure.value, contract.measure.valueType, measureUnit);
          row.measureValue = formattedMeasure === "—" ? "" : formattedMeasure;
        } else {
          row.measureValue = "";
        }
      }

      return row;
    });
  }, [payload, selectedMeasure, csvColumns, formatCsvNumber]);

  const csvTableName = useMemo(() => {
    const statePart = (selectedState ?? NATIONAL_STATE_CODE).toLowerCase();
    const measurePart = selectedMeasure ? selectedMeasure.toLowerCase() : null;
    const bluePart = selection.blueOnly ? "bcbs" : null;
    return ["peer_comparison", statePart, measurePart, bluePart, selectedYear].filter(Boolean).join("_");
  }, [selectedState, selectedMeasure, selection.blueOnly, selectedYear]);

  const toggleBlueOnly = () => {
    setSelection((prev) => ({ ...prev, blueOnly: !prev.blueOnly }));
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Geographic Analysis</p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">Compare Contracts Within a State</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Select a geography and contract filters to explore how a plan performs against its peers. Hover over the map to
                view cohort context, and inspect the comparison table for detailed metrics and percentile rankings.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">State</label>
                <div className="relative">
                  <select
                    value={selectedState}
                    onChange={(event) => {
                      setSelectedState(event.target.value);
                      setPayload(null);
                    }}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {statesFetchState === "loading" && <option>Loading states…</option>}
                    {statesFetchState === "error" && <option value="">Failed to load</option>}
                    {statesFetchState === "loaded" &&
                      states.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name} ({state.code})
                        </option>
                      ))}
                  </select>
                </div>
                {stateFetchError && <p className="text-xs text-red-300">{stateFetchError}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Year</label>
                <select
                  value={selectedYear.toString()}
                  onChange={(event) => {
                    const nextYear = Number(event.target.value);
                    setSelectedYear(Number.isFinite(nextYear) ? nextYear : DEFAULT_ENROLLMENT_YEAR);
                    setPayload(null);
                  }}
                  className="rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {SUPPORTED_ENROLLMENT_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Plan type</label>
                <div className="relative">
                  <select
                    value={selection.planTypeGroup}
                    onChange={(event) => setSelection((prev) => ({ ...prev, planTypeGroup: event.target.value as ContractSelection["planTypeGroup"] }))}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {PLAN_TYPE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Contract series</label>
                <select
                  value={selection.contractSeries}
                  onChange={(event) =>
                    setSelection((prev) => ({ ...prev, contractSeries: event.target.value as ContractSelection["contractSeries"] }))
                  }
                  className="rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {CONTRACT_SERIES_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Enrollment level</label>
                <select
                  value={selection.enrollmentLevel}
                  onChange={(event) =>
                    setSelection((prev) => ({ ...prev, enrollmentLevel: event.target.value as EnrollmentLevelId }))
                  }
                  className="rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {ENROLLMENT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2" ref={contractDropdownRef}>
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Target contract</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsContractDropdownOpen(!isContractDropdownOpen)}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2 text-left text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 flex items-center justify-between"
                  >
                    <span className="truncate">
                      {targetContractId
                        ? contractOptions.find((opt) => opt.value === targetContractId)?.label || "None selected"
                        : "None selected"}
                    </span>
                    <Search className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                  </button>
                  {isContractDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg">
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search contracts..."
                            value={contractSearchQuery}
                            onChange={(e) => setContractSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-border bg-muted pl-9 pr-9 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            autoFocus
                          />
                          {contractSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setContractSearchQuery("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted-foreground/10 rounded"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetContractId("");
                            setIsContractDropdownOpen(false);
                            setContractSearchQuery("");
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/40 transition ${
                            targetContractId === "" ? "bg-primary/5 text-primary" : "text-muted-foreground"
                          }`}
                        >
                          None selected
                        </button>
                        {filteredContractOptions.length > 0 ? (
                          filteredContractOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setTargetContractId(option.value);
                                setIsContractDropdownOpen(false);
                                setContractSearchQuery("");
                              }}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/40 transition ${
                                targetContractId === option.value ? "bg-primary/5 text-primary" : "text-foreground"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                            No contracts found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Measure</label>
                <div className="relative">
                  <select
                    value={selectedMeasure}
                    onChange={(event) => {
                      setSelectedMeasure(event.target.value);
                      setPayload(null);
                    }}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">Star ratings (default)</option>
                    {measureOptionsFetchState === "loading" && <option>Loading measures…</option>}
                    {measureOptionsFetchState === "error" && <option value="">Failed to load measures</option>}
                    {measureOptionsFetchState === "loaded" &&
                      measureOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name} ({option.code})
                        </option>
                      ))}
                  </select>
                </div>
                {measureOptionsError && <p className="text-xs text-red-300">{measureOptionsError}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Blue focus</label>
                <button
                  onClick={toggleBlueOnly}
                  className={`rounded-xl border px-4 py-2 text-sm transition ${
                    selection.blueOnly
                      ? "border-primary/70 bg-primary/10 text-primary"
                      : "border-border bg-muted text-foreground hover:border-border/70"
                  }`}
                >
                  {selection.blueOnly ? "Filtering to Blue Cross Blue Shield" : "Include all organizations"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => {
                setPayload(null);
                fetchData();
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Refresh analysis
            </button>
            <p className="text-xs text-muted-foreground">
              Last updated {payload ? format(new Date(payload.generatedAt), "MMM d, yyyy 'at' h:mm a") : "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="min-h-[480px] rounded-3xl border border-border bg-card p-4">
          {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
            <div className="flex h-full items-center justify-center text-sm text-red-300">
              Set NEXT_PUBLIC_MAPBOX_TOKEN to render the interactive map.
            </div>
          )}

          {process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
            <div className="relative h-full w-full">
              <div ref={mapContainerRef} className="h-full w-full rounded-2xl" />
              {!statePolygons && (
                <div className="absolute inset-x-0 bottom-4 mx-4 rounded-xl border border-border bg-background/95 p-3 text-xs text-muted-foreground shadow-lg">
                  Loading state boundaries…
                </div>
              )}
              <div className="absolute bottom-4 left-4 rounded-xl border border-border bg-card/90 p-3 text-[11px] shadow-lg backdrop-blur">
                <p className="mb-2 font-medium text-foreground">{mapLegendTitle}</p>
                <div className="flex flex-col gap-1">
                  {selectedMeasure ? (
                    stateLegendStops && stateLegendStops.length ? (
                      <>
                        {stateLegendStops.map((stop, index) => (
                          <div key={`${stop.color}-${index}`} className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full border border-border/40"
                              style={{ backgroundColor: stop.color }}
                            />
                            <span className="text-muted-foreground">{stop.label}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border border-border/40 bg-[#9ca3af]" />
                          <span className="text-muted-foreground">No measure data</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Measure data unavailable</span>
                    )
                  ) : (
                    <>
                      {STAR_COLORS.map((entry, index) => {
                        const next = STAR_COLORS[index - 1];
                        const label = next
                          ? `${entry.threshold.toFixed(1)} – ${(next.threshold - 0.1).toFixed(1)}`
                          : `${entry.threshold.toFixed(1)}+`;
                        return (
                          <div key={entry.threshold} className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full border border-border/40"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-muted-foreground">{label}</span>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border border-border/40 bg-[#9ca3af]" />
                        <span className="text-muted-foreground">No rating data</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {payload
                ? `${payload.geography.name} • ${payload.cohort.contractCount.toLocaleString()} contracts`
                : "Cohort summary"}
            </div>

            {dataFetchState === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating cohort metrics…
              </div>
            )}

            {dataFetchState === "error" && dataError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
                {dataError}
              </div>
            )}

            {dataFetchState === "loaded" && !payload && dataError && (
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {dataError}
              </div>
            )}

            {payload && cohortStats && (
              <div className="grid gap-4 sm:grid-cols-3">
                {cohortStats.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-border bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.title}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {item.key === "measure"
                        ? formatMeasureValue(
                            item.stats.average,
                            currentMeasureSummary?.valueType ?? "numeric",
                            currentMeasureSummary?.unit ?? null
                          )
                        : formatNumber(item.stats.average)}
                    </p>
                    <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <dt>Median</dt>
                        <dd>
                          {item.key === "measure"
                            ? formatMeasureValue(
                                item.stats.median,
                                currentMeasureSummary?.valueType ?? "numeric",
                                currentMeasureSummary?.unit ?? null
                              )
                            : formatNumber(item.stats.median)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Q1 • Q3</dt>
                        <dd>
                          {item.key === "measure"
                            ? `${formatMeasureValue(
                                item.stats.q1,
                                currentMeasureSummary?.valueType ?? "numeric",
                                currentMeasureSummary?.unit ?? null
                              )} – ${formatMeasureValue(
                                item.stats.q3,
                                currentMeasureSummary?.valueType ?? "numeric",
                                currentMeasureSummary?.unit ?? null
                              )}`
                            : `${formatNumber(item.stats.q1)} – ${formatNumber(item.stats.q3)}`}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Min • Max</dt>
                        <dd>
                          {item.key === "measure"
                            ? `${formatMeasureValue(
                                item.stats.min,
                                currentMeasureSummary?.valueType ?? "numeric",
                                currentMeasureSummary?.unit ?? null
                              )} – ${formatMeasureValue(
                                item.stats.max,
                                currentMeasureSummary?.valueType ?? "numeric",
                                currentMeasureSummary?.unit ?? null
                              )}`
                            : `${formatNumber(item.stats.min)} – ${formatNumber(item.stats.max)}`}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>

          {targetContract && (
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Target contract</p>
              <h3 className="mt-2 text-xl font-semibold text-foreground">
                {targetContract.contractId} • {targetContract.label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {targetContract.parentOrganization ?? "Parent organization unknown"} • {selectedState}
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <MetricComparisonCard
                  title="Overall rating"
                  value={targetContract.metrics.overall.current}
                  delta={targetContract.metrics.overall.delta}
                  percentile={targetContract.percentile.overall}
                  cohortAverage={payload?.cohort.overall.average ?? null}
                  valueType="star"
                />
                <MetricComparisonCard
                  title="Part C rating"
                  value={targetContract.metrics.partC.current}
                  delta={targetContract.metrics.partC.delta}
                  percentile={targetContract.percentile.partC}
                  cohortAverage={payload?.cohort.partC.average ?? null}
                  valueType="star"
                />
                <MetricComparisonCard
                  title="Part D rating"
                  value={targetContract.metrics.partD.current}
                  delta={targetContract.metrics.partD.delta}
                  percentile={targetContract.percentile.partD}
                  cohortAverage={payload?.cohort.partD.average ?? null}
                  valueType="star"
                />
                {selectedMeasure && payload?.measure?.summary && targetContract.measure && (
                  <MetricComparisonCard
                    title={`${payload.measure.summary.name} (${payload.measure.summary.code})`}
                    value={targetContract.measure.value}
                    percentile={payload.measure.target?.percentile ?? null}
                    cohortAverage={payload.measure.summary.stats.average ?? null}
                    valueType={targetContract.measure.valueType}
                    unit={targetContract.measure.unit ?? payload.measure.summary.unit ?? null}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Contract cohort</p>
            <h3 className="text-lg font-semibold text-foreground">Peer comparison table</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {payload ? `${payload.contracts.length.toLocaleString()} records` : "—"}
            </span>
            {payload && (
              <ExportCsvButton config={csvConfig} rows={csvRows} tableName={csvTableName} />
            )}
          </div>
        </div>

        {payload && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Contract</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Parent organization</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Enrollment</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Overall</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Part C</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Part D</th>
                  {selectedMeasure && payload.measure?.summary && (
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      {payload.measure.summary.name}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payload.contracts.map((contract) => {
                  const isTarget = targetContractId && contract.contractId === targetContractId;
                  return (
                    <tr
                      key={contract.contractId}
                      className={`transition hover:bg-muted/40 ${isTarget ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{contract.contractId}</div>
                        <div className="text-xs text-muted-foreground">{contract.label}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {contract.parentOrganization ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {contract.totalEnrollment !== null ? contract.totalEnrollment.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatNumber(contract.metrics.overall.current)}
                        {contract.metrics.overall.delta !== null && (
                          <span
                            className={`ml-2 text-xs ${
                              contract.metrics.overall.delta > 0
                                ? "text-emerald-400"
                                : contract.metrics.overall.delta < 0
                                ? "text-red-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {contract.metrics.overall.delta > 0 ? "+" : ""}
                            {formatNumber(contract.metrics.overall.delta)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatNumber(contract.metrics.partC.current)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatNumber(contract.metrics.partD.current)}
                      </td>
                      {selectedMeasure && payload.measure?.summary && (
                        <td className="px-4 py-3 text-sm">
                          {contract.measure && contract.measure.value !== null
                            ? formatMeasureValue(
                                contract.measure.value,
                                contract.measure.valueType,
                                contract.measure.unit ?? payload.measure.summary.unit ?? null
                              )
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type MetricComparisonCardProps = {
  title: string;
  value: number | null;
  delta?: number | null;
  percentile: number | null;
  cohortAverage: number | null;
  valueType?: MeasureValueType;
  unit?: string | null;
};

function MetricComparisonCard({
  title,
  value,
  delta = null,
  percentile,
  cohortAverage,
  valueType = "star",
  unit = null,
}: MetricComparisonCardProps) {
  const formatValue = (input: number | null) => {
    return formatMeasureValue(input, valueType, unit);
  };

  const percentileLabel = () => {
    if (percentile === null) return "—";
    if (percentile >= 90) return `${percentile}% (top decile)`;
    if (percentile <= 10) return `${percentile}% (bottom decile)`;
    return `${percentile}%`;
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground">{formatValue(value)}</span>
        {delta !== null && (
          <span
            className={`text-xs ${
              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(2)} YoY
          </span>
        )}
      </div>
      <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <dt>Percentile</dt>
          <dd>{percentileLabel()}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Cohort average</dt>
          <dd>{formatValue(cohortAverage)}</dd>
        </div>
      </dl>
    </div>
  );
}
