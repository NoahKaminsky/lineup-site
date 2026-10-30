import type { StudioPlan } from "@/app/lib/plans";

export type TeamMember = {
  id: string;
  profileId: string | null;
  name: string | null;
  avatarUrl: string | null;
  verificationStatus: string | null;
  role: "owner" | "manager" | "member";
  status: "invited" | "active";
  invitedEmail: string | null;
  inviteExpired: boolean;
  commissionOverride: number | null;
  effectiveCut: number | null;
  arrangement: "commission" | "booth_rent" | null;
  rentCents: number | null;
  rentInterval: "week" | "month" | null;
  rentStatus: string | null;
  rentPaidUntil: string | null;
  joinedAt: string | null;
};

export type ScheduleItem = {
  id: string;
  kind: "online" | "walk_in" | "phone";
  professionalId: string;
  date: string;
  start: string;
  end: string;
  status: string;
  service: string | null;
  source: string | null;
  payAtShop: boolean;
  clientName: string | null;
  clientPhone: string | null;
  priceCents: number | null;
  note: string | null;
};

export type ServiceOption = { id: string; name: string; durationMinutes: number; priceCents: number | null };

export type StudioData = {
  role: string | null;
  invites?: { id: string; studioName: string }[];
  studio: null | {
    id: string;
    name: string;
    plan: StudioPlan | null;
    subscriptionStatus: string | null;
    live: boolean;
    periodEnd: string | null;
    commissionPercent: number;
    hasBilling: boolean;
    slug: string | null;
    tagline: string | null;
    payAtShop: boolean;
    noShowFeePercent: number;
    coversTeam: boolean;
    minPros: number;
  };
  me?: { memberId: string; role: TeamMember["role"]; canManage: boolean; isOwner: boolean };
  team?: TeamMember[];
  schedule?: ScheduleItem[];
  services?: Record<string, ServiceOption[]>;
  earnings?: null | {
    byMember: Record<
      string,
      { bookings: number; salesCents: number; shopCutCents: number; inShopSalesCents: number; inShopCutCents: number }
    >;
    paidCents: number;
    owedCents: number;
    inShopCutCents: number;
  };
  payouts?: null | { connected: boolean; ready: boolean };
};

export type NoticeValue = { tone: "error" | "success"; text: string } | null;

export type SectionProps = {
  data: StudioData;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  setNotice: (n: NoticeValue) => void;
  reload: () => Promise<void>;
};

export function roleLabel(role: TeamMember["role"]) {
  return role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Member";
}

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

export function addDays(key: string, days: number) {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export function time12(value: string) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export function toMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number) {
  const t = Math.max(0, Math.min(total, 23 * 60 + 59));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// Now, rounded up to the next quarter hour.
export function nextQuarterHour() {
  const d = new Date();
  return fromMinutes(Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 15) * 15);
}

export function firstName(name: string | null | undefined) {
  return (name || "").trim().split(/\s+/)[0] || "Team member";
}
