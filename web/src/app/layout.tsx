import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "portfolio-sync",
  description: "Generate portfolio data from your GitHub repos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
