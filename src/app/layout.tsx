import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Clarity — product discovery", description: "Think clearly, keep the evidence, decide better." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
