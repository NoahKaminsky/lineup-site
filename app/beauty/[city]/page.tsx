import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findCity } from "@/app/lib/cities";
import LocalPage from "../LocalPage";
import { loadCityPage } from "../data";

// Rebuilt at most once an hour, so new pros show up without a deploy.
export const revalidate = 3600;

type Params = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const city = findCity((await params).city);
  if (!city) return {};
  const { pros, shops } = await loadCityPage(city, null);
  return {
    title: `Beauty and grooming pros in ${city.name}, ${city.province}`,
    description: `Find and book verified barbers, hairstylists, nail, lash and brow artists in ${city.name}. Compare their work and reviews, or post a request and get offers from pros near you.`,
    alternates: { canonical: `/beauty/${city.slug}` },
    // An empty page isn't worth a search result; it's indexed once someone's here.
    robots: pros.length || shops.length ? undefined : { index: false, follow: true },
  };
}

export default async function CityPage({ params }: Params) {
  const city = findCity((await params).city);
  if (!city) notFound();
  const data = await loadCityPage(city, null);
  return <LocalPage city={city} trade={null} {...data} />;
}
