-- An offer's price must be one amount checkout can charge: the same rule as
-- offerPriceCents (app/lib/offerPrice.ts) and the payment step. "$55", "55.50"
-- and "1,200 CAD" pass; "55-60", "about 50", "0" don't. The offer form already
-- refuses these; this stops one arriving another way (an edit, an API call).
-- Row-level security is unchanged. Safe to re-run.
alter table public.request_offers drop constraint if exists request_offers_price_is_chargeable;
alter table public.request_offers add constraint request_offers_price_is_chargeable check (
  proposed_price is null
  or case
    when btrim(regexp_replace(proposed_price, '(?i)cad|\$|,', '', 'g')) ~ '^(\d+\.?\d*|\.\d+)$'
      then btrim(regexp_replace(proposed_price, '(?i)cad|\$|,', '', 'g'))::numeric > 0
    else false
  end
);
