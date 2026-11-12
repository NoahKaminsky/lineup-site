import { cache } from "react";
import { getLocalDirectory } from "@/app/lib/localPros";
import { TRADES, type City, type Trade } from "@/app/lib/cities";

// One directory load per request, shared by the page and its metadata.
export const loadDirectory = cache(getLocalDirectory);

export async function loadCityPage(city: City, trade: Trade | null) {
  const { pros, shops } = await loadDirectory();
  const inCity = pros.filter((p) => p.city.slug === city.slug);
  const shopsInCity = shops.filter((s) => s.city.slug === city.slug);
  const tradesHere = TRADES.filter((t) => inCity.some((p) => p.professions.some((x) => t.professions.includes(x))));
  const listed = trade ? inCity.filter((p) => p.professions.some((x) => trade.professions.includes(x))) : inCity;
  const listedShops = trade
    ? shopsInCity.filter((s) => s.trades.some((x) => trade.professions.includes(x)))
    : shopsInCity;
  return { pros: listed, shops: listedShops, tradesHere };
}
