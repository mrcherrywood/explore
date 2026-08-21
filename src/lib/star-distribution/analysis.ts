import {
  getAvailableMeasureYears,
  getAvailableOptions,
  getMeasureYearScoreSamples,
  getMeasureYearStarSamples,
} from "@/lib/band-movement/analysis";
import { isEligibleOverlayContract } from "@/lib/cutpoint-forecast/pp1-overlay";
import { isInvertedMeasure } from "@/lib/percentile-analysis/measure-matching";

import {
  compareMeasuresPartThenName,
  compareScores,
  compareShares,
  emptyScoreSlice,
  poolScoreShares,
  poolShares,
  recencyWeights,
  shareFromScores,
  shareFromStars,
} from "./stats";
import { buildBookRosterOrgs } from "./orgs";
import {
  LAST3_YEARS,
  STAR_DISTRIBUTION_YEARS,
  type BookRosterInventory,
  type BookRosterSources,
  type ComparisonSlice,
  type MeasureDistribution,
  type MeasureYearSlice,
  type RosterMode,
  type ScoreSlice,
  type StarDistributionResponse,
  type StarShare,
} from "./types";

function isQualityImprovementMeasure(displayName: string): boolean {
  return /quality improvement/i.test(displayName);
}

function sliceFromStars(cmsStars: number[], bookStars: number[]): ComparisonSlice {
  return compareShares(shareFromStars(cmsStars), shareFromStars(bookStars));
}

function poolMeasureYears(
  years: MeasureYearSlice[],
  filterYears?: readonly number[],
  weights?: Record<number, number>
): ComparisonSlice {
  const rows = filterYears
    ? years.filter((row) => filterYears.includes(row.year))
    : years;
  return compareShares(
    poolShares(
      rows.map((row) => ({ year: row.year, share: row.cms })),
      weights
    ),
    poolShares(
      rows.map((row) => ({ year: row.year, share: row.book })),
      weights
    )
  );
}

function poolScoreYears(
  years: MeasureYearSlice[],
  filterYears?: readonly number[],
  weights?: Record<number, number>
): ScoreSlice {
  const rows = filterYears
    ? years.filter((row) => filterYears.includes(row.year))
    : years;
  return compareScores(
    poolScoreShares(
      rows.map((row) => ({ year: row.year, share: row.score.cms })),
      weights
    ),
    poolScoreShares(
      rows.map((row) => ({ year: row.year, share: row.score.book })),
      weights
    )
  );
}

function sliceFromScores(cmsScores: number[], bookScores: number[]): ScoreSlice {
  return compareScores(shareFromScores(cmsScores), shareFromScores(bookScores));
}

function poolAllMeasures(
  measures: MeasureDistribution[],
  pick: (measure: MeasureDistribution) => ComparisonSlice
): ComparisonSlice {
  const cms: StarShare[] = [];
  const book: StarShare[] = [];
  for (const measure of measures) {
    const slice = pick(measure);
    cms.push(slice.cms);
    book.push(slice.book);
  }
  return compareShares(
    poolShares(cms.map((share, index) => ({ year: index, share }))),
    poolShares(book.map((share, index) => ({ year: index, share })))
  );
}

export function analyzeStarDistribution(
  bookIds: Set<string>,
  roster: RosterMode,
  inventory: BookRosterInventory,
  sources: BookRosterSources = { forecast: bookIds, pp1: new Set() }
): StarDistributionResponse {
  const years = getAvailableMeasureYears().filter((year) =>
    (STAR_DISTRIBUTION_YEARS as readonly number[]).includes(year)
  );
  const weights = recencyWeights();
  const measures: MeasureDistribution[] = [];

  for (const measure of getAvailableOptions().measures) {
    if (isQualityImprovementMeasure(measure.displayName)) continue;

    const yearSlices: MeasureYearSlice[] = [];
    for (const year of years) {
      const samples = getMeasureYearStarSamples(measure.normalizedName, year).filter(
        (sample) => isEligibleOverlayContract(sample.contractId)
      );
      const scoreSamples = getMeasureYearScoreSamples(
        measure.normalizedName,
        year
      ).filter((sample) => isEligibleOverlayContract(sample.contractId));
      if (samples.length === 0 && scoreSamples.length === 0) continue;

      const cmsStars = samples.map((sample) => sample.star);
      const bookStars = samples
        .filter((sample) => bookIds.has(sample.contractId))
        .map((sample) => sample.star);
      const cmsScores = scoreSamples.map((sample) => sample.score);
      const bookScores = scoreSamples
        .filter((sample) => bookIds.has(sample.contractId))
        .map((sample) => sample.score);

      yearSlices.push({
        year,
        code: measure.codesByYear[year] ?? "",
        ...sliceFromStars(cmsStars, bookStars),
        score:
          scoreSamples.length === 0
            ? emptyScoreSlice()
            : sliceFromScores(cmsScores, bookScores),
      });
    }

    if (yearSlices.length === 0) continue;

    measures.push({
      name: measure.displayName,
      normalizedName: measure.normalizedName,
      inverted: isInvertedMeasure(measure.displayName),
      years: yearSlices,
      all: poolMeasureYears(yearSlices),
      last3: poolMeasureYears(yearSlices, LAST3_YEARS),
      last3W: poolMeasureYears(yearSlices, LAST3_YEARS, weights),
      allScore: poolScoreYears(yearSlices),
      last3Score: poolScoreYears(yearSlices, LAST3_YEARS),
      last3WScore: poolScoreYears(yearSlices, LAST3_YEARS, weights),
    });
  }

  measures.sort(compareMeasuresPartThenName);

  const byYear = years.map((year) => {
    const cmsStars: number[] = [];
    const bookStars: number[] = [];
    for (const measure of measures) {
      const row = measure.years.find((entry) => entry.year === year);
      if (!row) continue;
      for (let star = 1; star <= 5; star += 1) {
        cmsStars.push(...Array(row.cms.counts[star - 1]).fill(star));
        bookStars.push(...Array(row.book.counts[star - 1]).fill(star));
      }
    }
    return { year, ...sliceFromStars(cmsStars, bookStars) };
  });

  return {
    roster,
    inventory,
    years,
    orgs: buildBookRosterOrgs(bookIds, sources),
    pooled: {
      all: poolAllMeasures(measures, (measure) => measure.all),
      last3: poolAllMeasures(measures, (measure) => measure.last3),
      last3W: poolAllMeasures(measures, (measure) => measure.last3W),
      byYear,
    },
    measures,
  };
}
