import UnsubscribeClient from "./UnsubscribeClient";

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
