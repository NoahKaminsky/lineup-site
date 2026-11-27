import { PAGE_TITLES } from "@/app/lib/pageTitles";
import UnsubscribeClient from "./UnsubscribeClient";

export const metadata = { title: PAGE_TITLES["/unsubscribe"] };

type UnsubscribePageProps = {
  searchParams: Promise<{
    email?: string;
  }>;
};

export default async function UnsubscribePage({
  searchParams,
}: UnsubscribePageProps) {
  const params = await searchParams;
  const email = params.email ?? "";

  return <UnsubscribeClient email={email} />;
}
