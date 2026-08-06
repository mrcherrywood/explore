import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";
import "@/styles/fep-theme.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Health Plan Data Explorer",
  description: "Health Plan Data Explorer",
  openGraph: {
    title: "Health Plan Data Explorer",
    description: "Health Plan Data Explorer",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Health Plan Data Explorer",
    description: "Health Plan Data Explorer",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`fep ${hanken.variable} ${newsreader.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          forcedTheme="light"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
