import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Does It Work?",
  description: "Plain-language info on supplements and OTC products, based on public research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
