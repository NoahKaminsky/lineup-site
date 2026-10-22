import { Instrument_Serif } from "next/font/google";

// The newspaper face for /news: a sharp display serif for the masthead and
// headlines (falls back to Georgia while it loads).
export const newsSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-news-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
