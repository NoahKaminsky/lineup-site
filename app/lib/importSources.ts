// Where an import came from. Shared by the import screens (browser) and the
// import API (server), so it holds no server code.
export const SOURCE_APPS = ["squire", "booksy", "fresha", "vagaro", "square", "google", "apple", "other"] as const;
export type SourceApp = (typeof SOURCE_APPS)[number];
export const SOURCE_APP_LABELS: Record<SourceApp, string> = {
  squire: "Squire",
  booksy: "Booksy",
  fresha: "Fresha",
  vagaro: "Vagaro",
  square: "Square",
  google: "Google Calendar",
  apple: "Apple Calendar",
  other: "Another app or a spreadsheet",
};
