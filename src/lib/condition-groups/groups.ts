export type ConditionGroup = {
  id: string;
  label: string;
  color: string;
  measurePatterns: string[];
};

export const CONDITION_GROUPS: ConditionGroup[] = [
  {
    id: "diabetes",
    label: "Diabetes",
    color: "#818cf8",
    measurePatterns: [
      "diabetes care – eye exam",
      "diabetes care – blood sugar controlled",
      "kidney health evaluation for patients with diabetes",
      "medication adherence for diabetes medications",
      "statin use in persons with diabetes",
    ],
  },
  {
    id: "cardiovascular",
    label: "Cardiovascular Disease",
    color: "#f472b6",
    measurePatterns: [
      "controlling high blood pressure",
      "statin therapy for patients with cardiovascular disease",
      "medication adherence for hypertension",
      "medication adherence for cholesterol",
    ],
  },
  {
    id: "care_transitions",
    label: "Care Transitions",
    color: "#34d399",
    measurePatterns: [
      "plan all-cause readmissions",
      "transitions of care",
      "follow-up after emergency department visit",
    ],
  },
];

export function matchMeasureToGroup(
  measureName: string
): ConditionGroup | null {
  const normalized = measureName
    .replace(/\u0096/g, "–")
    .replace(/\u2014/g, "–")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  for (const group of CONDITION_GROUPS) {
    for (const pattern of group.measurePatterns) {
      if (normalized.includes(pattern)) {
        return group;
      }
    }
  }
  return null;
}
