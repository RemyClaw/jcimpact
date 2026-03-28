import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  title: "Jersey City IMPACT - CompStat Public Safety Dashboard",
  description: "Crime incident data and analytics for Jersey City, NJ",
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
