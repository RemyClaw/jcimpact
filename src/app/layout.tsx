import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JCImpact - Jersey City Crime Dashboard",
  description: "Crime incident data and analytics for Jersey City, NJ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-surface text-slate-200 antialiased`}>
        {children}
      </body>
    </html>
  );
}
