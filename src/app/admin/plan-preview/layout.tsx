import type { ReactNode } from "react";
import { Hanken_Grotesk, Newsreader } from "next/font/google";

import "./fep-theme.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });

export default function PlanPreviewLayout({ children }: { children: ReactNode }) {
  return <div className={`fep ${hanken.variable} ${newsreader.variable}`}>{children}</div>;
}
