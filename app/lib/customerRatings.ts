import { supabase } from "@/lib/supabaseClient";

export type CustomerRatingSummary = { average: number; count: number };

export async function getCustomerRatingsMap(
  customerIds: string[]
): Promise<Record<string, CustomerRatingSummary>> {
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from("customer_reviews")
    .select("customer_id, rating")
    .in("customer_id", uniqueIds);

  if (error || !data) return {};

  const totals = new Map<string, { sum: number; count: number }>();

  data.forEach((row) => {
    const entry = totals.get(row.customer_id) || { sum: 0, count: 0 };
    entry.sum += row.rating;
    entry.count += 1;
    totals.set(row.customer_id, entry);
  });

  const result: Record<string, CustomerRatingSummary> = {};
  totals.forEach((value, customerId) => {
    result[customerId] = { average: value.sum / value.count, count: value.count };
  });

  return result;
}
