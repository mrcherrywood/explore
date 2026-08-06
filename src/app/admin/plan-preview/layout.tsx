import type { ReactNode } from "react";

/** Plan Preview inherits the app-wide FEP theme from the root layout. */
export default function PlanPreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
