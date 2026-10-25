// Shared by the /calendar server loader and its client refresh (safe to
// import from either side).

// What the calendar actually shows: everything still open, plus jobs completed
// in the last day ("Recently completed"). Older completed work lives in
// /archive — loading a pro's entire booking history on every visit was the
// main thing making this page slower over time.
export function calendarStatusFilter() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return `status.in.(confirmed,completion_requested),and(status.eq.completed,completed_at.gte."${cutoff}")`;
}
