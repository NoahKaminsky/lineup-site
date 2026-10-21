// Browser side of /api/professional/busy-times: booked time ranges for one or
// more professionals, shaped like the booking rows the calendars use.
// Returns null if the times couldn't be loaded (so callers can keep what
// they already have instead of showing everything as open).

type BusyRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "confirmed";
};

const CHUNK = 100;

export async function fetchBusyTimes(professionalIds: string[], fromDate: string, toDate: string): Promise<BusyRow[] | null> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return [];

  try {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const params = new URLSearchParams({ ids: chunk.join(","), from: fromDate, to: toDate });
        const res = await fetch(`/api/professional/busy-times?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`busy-times ${res.status}`);
        const json = (await res.json()) as {
          busy?: { professional_id: string; booking_date: string; start_time: string; end_time: string }[];
        };
        return json.busy || [];
      })
    );

    return results.flat().map((row, index) => ({
      id: `busy-${row.professional_id}-${row.booking_date}-${row.start_time}-${index}`,
      professional_id: row.professional_id,
      customer_id: "",
      booking_date: row.booking_date,
      start_time: row.start_time,
      end_time: row.end_time,
      status: "confirmed" as const,
    }));
  } catch (error) {
    console.error("Could not load booked times:", error);
    return null;
  }
}
