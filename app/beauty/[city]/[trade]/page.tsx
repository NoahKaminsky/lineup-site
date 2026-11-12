import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findCity, findTrade } from "@/app/lib/cities";
import LocalPage from "../../LocalPage";
import { loadCityPage } from "../../data";

export const revalidate = 3600;

type Params = { params: Promise<{ city: string; trade: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug, trade: tradeSlug } = await params;
  const city = findCity(citySlug);
  const trade = findTrade(tradeSlug);
  if (!city || !trade) return {};
  const { pros, shops } = await loadCityPage(city, trade);
  return {
    title: `${trade.plural} in ${city.name}, ${city.province}`,
    description: `Book a verified ${trade.singular} in ${city.name}. See their work, prices and reviews on LineUp, or post what you want and get offers from ${trade.plural.toLowerCase()} near you.`,
    alternates: { canonical: `/beauty/${city.slug}/${trade.slug}` },
    robots: pros.length || shops.length ? undefined : { index: false, follow: true },
  };
}

export default async function CityTradePage({ params }: Params) {
  const { city: citySlug, trade: tradeSlug } = await params;
  const city = findCity(citySlug);
  const trade = findTrade(tradeSlug);
  if (!city || !trade) notFound();
  const data = await loadCityPage(city, trade);
  return <LocalPage city={city} trade={trade} {...data} />;
}
