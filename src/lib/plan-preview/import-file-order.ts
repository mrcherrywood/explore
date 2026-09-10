/** Folder import order. Scores first, then stars, summaries, then QI overlay. */
export function planPreviewImportRank(fileName: string): number {
  const lower = fileName.toLowerCase();
  if (/measure[_\s-]*data/.test(lower)) return 10;
  if (/\b(cahps|hedis|snp|cai)\b/.test(lower)) return 15;
  if (/measure[_\s-]*star/.test(lower)) return 20;
  if (/summary|overall/.test(lower)) return 30;
  if (/improve/.test(lower)) return 40;
  return 25;
}

export function sortPlanPreviewImportFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort(
    (left, right) =>
      planPreviewImportRank(left.name) - planPreviewImportRank(right.name) ||
      left.name.localeCompare(right.name),
  );
}
