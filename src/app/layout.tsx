import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  title: "Jersey City IMPACT",
  description: "Integrated Metrics for Public Accountability & Community Trust",
  openGraph: {
    title: "Jersey City IMPACT",
    description: "Integrated Metrics for Public Accountability & Community Trust",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Jersey City IMPACT",
    description: "Integrated Metrics for Public Accountability & Community Trust",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${orbitron.variable} bg-surface text-slate-200 antialiased`}>
        {children}
      </body>
    </html>
  );
}
