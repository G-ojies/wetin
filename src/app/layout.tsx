import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Wetin — know your rights under Nigerian law",
  description: "Ask in English or Pidgin. Get a plain answer grounded in the actual section of Nigerian law, with every quote verified against the statute text.",
  openGraph: { title: "Wetin be my right?", description: "Plain answers from Nigerian law, with the exact section cited and verified.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0f5c34", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
