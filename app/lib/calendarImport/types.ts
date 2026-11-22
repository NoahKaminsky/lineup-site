// Shared shapes for reading a shop's calendar files in the browser. Nothing
// here is saved: files are read on the device and only the preview is shown.

export type Confidence = "confident" | "check" | "none";

export type ImportRow = {
  key: string; // unique within this preview
  fileId: string;
  where: string; // "line 14" or the event title, for showing where it came from
  date: string; // YYYY-MM-DD on the shop clock
  start: string; // HH:MM
  end: string; // HH:MM
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  service: string | null;
  priceCents: number | null;
  staffText: string | null; // the staff name as written in the file, if any
  proId: string | null;
  confidence: Confidence;
  guessedEnd: boolean;
  repeating: boolean; // one visit of a repeating event
};

export type SkippedRow = { fileId: string; where: string; reason: string };

export type TeamPro = { id: string; name: string };

export type ParsedFile = {
  rows: ImportRow[];
  skipped: SkippedRow[];
};
