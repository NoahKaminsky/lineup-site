export function getProfileHref(profile: { id: string; username?: string | null }) {
  return `/profile/${profile.username?.trim() || profile.id}`;
}
