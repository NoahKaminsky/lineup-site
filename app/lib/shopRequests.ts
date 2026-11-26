// Which client requests belong in a shop's Requests list: only the ones where
// the client chose to go to the pro's shop ("Their shop", service mode
// in_shop). Mobile ("at my place") and "home studio" requests are personal
// to a pro and never show to the shop or get passed around by it.
export function wantsShopVisit(r: { service_modes?: string[] | null; service_mode?: string | null }) {
  const modes = r.service_modes?.length ? r.service_modes : r.service_mode ? [r.service_mode] : [];
  return modes.includes("in_shop");
}
