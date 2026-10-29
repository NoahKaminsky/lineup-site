"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Check, Mail, Percent, Settings, Users } from "lucide-react";
import LuLoader from "@/app/components/LuLoader";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { STUDIO_PLANS, type StudioPlan } from "@/app/lib/plans";
import { STUDIO_MAX_COMMISSION_PERCENT } from "@/app/lib/commission";
import { formatCad, studioFetch } from "./studioApi";

type TeamMember = {
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
  joinedAt: string | null;
};

type ScheduleItem = {
  id: string;
  professionalId: string;
  date: string;
  start: string;
  end: string;
  status: string;
  service: string | null;
  source: string | null;
  clientName: string | null;
};

type StudioData = {
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
  };
  me?: { memberId: string; role: TeamMember["role"]; canManage: boolean; isOwner: boolean };
  team?: TeamMember[];
  schedule?: ScheduleItem[];
  earnings?: null | {
    byMember: Record<string, { bookings: number; salesCents: number; shopCutCents: number }>;
    paidCents: number;
    owedCents: number;
  };
  payouts?: null | { connected: boolean; ready: boolean };
};

type Tab = "schedule" | "team" | "settings";

const card = "rounded-panel border border-hairline bg-surface";
const eyebrow = "font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60";
const input =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white";

function roleLabel(role: TeamMember["role"]) {
  return role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Member";
}

function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (date === todayKey) return "Today";
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

function time12(value: string) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export default function StudioPage() {
  const router = useRouter();
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("schedule");
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await studioFetch<StudioData>("/api/studio");
    if (res.status === 401) {
      router.push("/login?next=/studio");
      return;
    }
    if (!res.ok) {
      setNotice({ tone: "error", text: res.data.error || "Could not load your studio." });
    } else {
      setData(res.data);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    (async () => {
      const user = await getSignedInUser();
      if (!user) {
        router.push("/login?next=/studio");
        return;
      }
      await load();
    })();

    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") === "1") {
      setNotice({ tone: "success", text: "Your studio plan is active. Your whole team is covered." });
    } else if (params.get("payouts") === "done") {
      setNotice({ tone: "success", text: "Payout details saved. The shop's cut will be paid to this account." });
    }
    if (params.toString()) window.history.replaceState({}, "", "/studio");
  }, [load, router]);

  // Members see the team; owners and managers land on the schedule.
  useEffect(() => {
    if (data?.me && !data.me.canManage) setTab("team");
  }, [data?.me]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function redirectTo(path: string, body: unknown, key: string) {
    await run(key, async () => {
      const res = await studioFetch<{ url?: string }>(path, { method: "POST", body });
      if (!res.ok || !res.data.url) {
        setNotice({ tone: "error", text: res.data.error || "Something went wrong." });
        return;
      }
      window.location.href = res.data.url;
    });
  }

  if (loading) return <LuLoader />;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl py-6 sm:py-10">
        {notice ? (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`lu-fade-in mb-6 rounded-2xl border p-4 text-sm ${
              notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-neutral-200 bg-neutral-100 text-ink"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        {!data?.studio ? (
          <NoStudio data={data} busy={busy} run={run} setNotice={setNotice} reload={load} />
        ) : (
          <>
            <StudioHeader data={data} />

            {data.me?.canManage && !data.studio.live ? (
              <PlanPicker
                isOwner={!!data.me.isOwner}
                current={null}
                busy={busy}
                onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
                note={
                  data.studio.subscriptionStatus === "past_due"
                    ? "The last payment didn't go through, so your team's plan is paused. Update billing to switch it back on."
                    : "Pick a plan to switch on your team. Until then, members use their own plans."
                }
              />
            ) : null}

            <nav className="mt-8 flex gap-1 border-b border-hairline" aria-label="Studio sections">
              {(
                [
                  { key: "schedule", label: "Schedule", Icon: CalendarDays, show: !!data.me?.canManage },
                  { key: "team", label: "Team", Icon: Users, show: true },
                  { key: "settings", label: "Settings", Icon: Settings, show: !!data.me?.isOwner },
                ] as const
              )
                .filter((t) => t.show)
                .map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    aria-current={tab === key ? "page" : undefined}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      tab === key ? "border-ink text-ink" : "border-transparent text-neutral-500 hover:text-ink"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
            </nav>

            <div className="mt-6">
              {tab === "schedule" && data.me?.canManage ? <ScheduleView data={data} /> : null}
              {tab === "team" ? (
                <TeamView data={data} busy={busy} run={run} setNotice={setNotice} reload={load} />
              ) : null}
              {tab === "settings" && data.me?.isOwner ? (
                <SettingsView data={data} busy={busy} run={run} setNotice={setNotice} reload={load} redirectTo={redirectTo} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

type SectionProps = {
  data: StudioData | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  setNotice: (n: { tone: "error" | "success"; text: string } | null) => void;
  reload: () => Promise<void>;
};

function StudioHeader({ data }: { data: StudioData }) {
  const studio = data.studio!;
  const activeCount = (data.team || []).filter((m) => m.status === "active").length;
  const planLabel = studio.plan ? STUDIO_PLANS[studio.plan].label : null;

  return (
    <div>
      <p className={eyebrow}>Studio</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{studio.name}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-medium text-neutral-700">
          {activeCount} {activeCount === 1 ? "pro" : "pros"}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-medium ${
            studio.live ? "bg-ink text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-600"
          }`}
        >
          {studio.live && planLabel ? planLabel : "No plan yet"}
        </span>
        {data.me ? (
          <span className="text-neutral-500">You&apos;re the {roleLabel(data.me.role).toLowerCase()}</span>
        ) : null}
      </div>
    </div>
  );
}

function PlanPicker({
  isOwner,
  current,
  busy,
  onChoose,
  note,
}: {
  isOwner: boolean;
  current: StudioPlan | null;
  busy: string | null;
  onChoose: (plan: StudioPlan) => void;
  note?: string;
}) {
  return (
    <section className="mt-8">
      {note ? <p className="mb-4 text-sm text-neutral-600">{note}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(STUDIO_PLANS) as StudioPlan[]).map((key) => {
          const plan = STUDIO_PLANS[key];
          const isCurrent = current === key;
          return (
            <div key={key} className={`${card} flex flex-col p-6`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.02em]">{plan.label}</h2>
                <p className="text-sm text-neutral-500">
                  <span className="text-2xl font-semibold text-ink">{plan.priceLabel}</span> CAD/mo
                </p>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Flat price for the whole shop</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm leading-6 text-neutral-700">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              {isOwner ? (
                <button
                  type="button"
                  disabled={!!busy || isCurrent}
                  onClick={() => onChoose(key)}
                  className={`mt-6 ${key === "studio_plus" ? primaryButton : secondaryButton}`}
                >
                  {isCurrent ? "Current plan" : busy === `plan-${key}` ? "Opening checkout…" : `Choose ${plan.label}`}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {!isOwner ? <p className="mt-3 text-xs text-neutral-500">Only the owner can choose the studio&apos;s plan.</p> : null}
    </section>
  );
}

function NoStudio({ data, busy, run, setNotice, reload }: SectionProps) {
  const [name, setName] = useState("");
  const isProfessional = data?.role === "professional";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await run("create", async () => {
      const res = await studioFetch("/api/studio", { method: "POST", body: { name } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not create your studio." });
        return;
      }
      await reload();
    });
  }

  async function accept(inviteId: string) {
    await run(`accept-${inviteId}`, async () => {
      const res = await studioFetch<{ studioName?: string }>("/api/studio/join", { method: "POST", body: { inviteId } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not join the studio." });
        return;
      }
      setNotice({ tone: "success", text: `You're on ${res.data.studioName}'s team.` });
      await reload();
    });
  }

  return (
    <div>
      <p className={eyebrow}>LineUp Studio</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
        Run your whole shop on LineUp.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
        One account for the shop, a login for every pro. See everyone&apos;s schedule in one place, set the shop&apos;s
        commission, and get new clients from requests. No commission on your own clients.
      </p>

      {data?.invites?.length ? (
        <section className={`${card} mt-8 p-6`}>
          <h2 className="text-base font-semibold">You&apos;ve been invited</h2>
          <ul className="mt-4 divide-y divide-hairline">
            {data.invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-neutral-700">
                  <span className="font-semibold text-ink">{invite.studioName}</span> wants you on their team.
                </span>
                {isProfessional ? (
                  <button type="button" disabled={!!busy} onClick={() => accept(invite.id)} className={primaryButton}>
                    {busy === `accept-${invite.id}` ? "Joining…" : "Join"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isProfessional ? (
        <form onSubmit={create} className={`${card} mt-8 p-6 sm:p-8`}>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Create your studio</h2>
          <p className="mt-1 text-sm text-neutral-600">
            You&apos;ll be the owner. Invite your team and pick a plan next.
          </p>
          <label htmlFor="studio-name" className="mb-2 mt-5 block text-sm font-medium text-neutral-800">
            Shop or studio name
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="studio-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Corner Cuts Barbershop"
              className={input}
            />
            <button type="submit" disabled={!!busy} className={`${primaryButton} shrink-0`}>
              {busy === "create" ? "Creating…" : "Create studio"}
            </button>
          </div>
        </form>
      ) : (
        <p className={`${card} mt-8 p-6 text-sm text-neutral-600`}>
          Studio accounts are for professionals. This account is set up for booking services.
        </p>
      )}

      <PlanPicker isOwner={false} current={null} busy={null} onChoose={() => {}} />
    </div>
  );
}

function ScheduleView({ data }: { data: StudioData }) {
  const [memberFilter, setMemberFilter] = useState("all");
  const team = (data.team || []).filter((m) => m.status === "active");
  const names = useMemo(() => new Map(team.map((m) => [m.profileId, m.name || "Team member"])), [team]);

  const items = (data.schedule || []).filter((b) => memberFilter === "all" || b.professionalId === memberFilter);
  const byDay = items.reduce<Record<string, ScheduleItem[]>>((acc, b) => {
    (acc[b.date] ||= []).push(b);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Next two weeks</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="sr-only">Show</span>
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="all">Whole team</option>
            {team.map((m) => (
              <option key={m.id} value={m.profileId || ""}>
                {m.name || "Team member"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {days.length === 0 ? (
        <p className={`${card} mt-4 p-6 text-sm text-neutral-600`}>
          No bookings in the next two weeks{memberFilter === "all" ? "" : " for this pro"}.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {days.map((day) => (
            <div key={day}>
              <h3 className={eyebrow}>{dayLabel(day)}</h3>
              <ul className={`${card} mt-2 divide-y divide-hairline`}>
                {byDay[day].map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                    <span className="w-32 shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {time12(b.start)}–{time12(b.end)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-700">
                      <span className="font-medium text-ink">{names.get(b.professionalId) || "Team member"}</span>
                      {" · "}
                      {b.service || "Booking"}
                      {b.clientName ? <span className="text-neutral-500"> with {b.clientName}</span> : null}
                    </span>
                    <span className="flex gap-1.5">
                      {b.source === "request" ? (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-ink">
                          New client
                        </span>
                      ) : null}
                      {b.status !== "confirmed" ? (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                          {b.status === "completed" ? "Done" : "Finishing up"}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamView({ data, busy, run, setNotice, reload }: SectionProps) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "manager">("member");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const me = data!.me!;
  const studio = data!.studio!;
  const team = data!.team || [];
  const earnings = data!.earnings;
  const isPlus = studio.live && studio.plan === "studio_plus";

  async function invite(e: { preventDefault(): void }, resendMemberId?: string) {
    e.preventDefault();
    await run(resendMemberId ? `resend-${resendMemberId}` : "invite", async () => {
      const res = await studioFetch<{ emailed?: boolean; joinUrl?: string; warning?: string }>("/api/studio/invite", {
        method: "POST",
        body: resendMemberId ? { resendMemberId } : { email, role: inviteRole },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not send the invite." });
        return;
      }
      if (res.data.emailed === false && res.data.joinUrl) {
        setShareLink(res.data.joinUrl);
        setNotice({ tone: "error", text: res.data.warning || "The email didn't send. Share the link instead." });
      } else {
        setNotice({ tone: "success", text: resendMemberId ? "Invite sent again." : `Invite sent to ${email}.` });
      }
      setEmail("");
      await reload();
    });
  }

  async function remove(member: TeamMember) {
    const self = member.id === me.memberId;
    const what =
      member.status === "invited"
        ? `Cancel the invite to ${member.invitedEmail}?`
        : self
        ? `Leave ${studio.name}? You keep your LineUp account, profile and bookings.`
        : `Remove ${member.name || "this pro"} from ${studio.name}? They keep their LineUp account, profile and bookings.`;
    if (!window.confirm(what)) return;

    await run(`remove-${member.id}`, async () => {
      const res = await studioFetch("/api/studio/members", { method: "DELETE", body: { memberId: member.id } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not remove them." });
        return;
      }
      if (self) {
        window.location.href = "/studio";
        return;
      }
      await reload();
    });
  }

  async function update(member: TeamMember, body: Record<string, unknown>, key: string, success: string) {
    await run(key, async () => {
      const res = await studioFetch("/api/studio/members", { method: "PATCH", body: { memberId: member.id, ...body } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not save." });
        return;
      }
      setNotice({ tone: "success", text: success });
      await reload();
    });
  }

  const myRow = team.find((m) => m.id === me.memberId);

  return (
    <section className="space-y-6">
      {!me.canManage && myRow ? (
        <div className={`${card} p-6`}>
          <h2 className="text-base font-semibold">Your spot on the team</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {studio.live
              ? "Your plan is covered by the studio, so you get Pro features without paying for your own."
              : "The studio doesn't have an active plan right now, so you're on your own plan."}{" "}
            {isPlus && myRow.effectiveCut ? (
              <>
                The shop keeps <span className="font-semibold text-ink">{myRow.effectiveCut}%</span> of each booking
                after LineUp&apos;s fee. Tips are all yours.
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {me.canManage ? (
        <form onSubmit={(e) => invite(e)} className={`${card} p-6`}>
          <h2 className="text-base font-semibold">Invite a pro</h2>
          <p className="mt-1 text-sm text-neutral-600">
            They&apos;ll get an email to join. New pros create their own login; pros already on LineUp keep theirs.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="invite-email" className="sr-only">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pro@example.com"
              className={input}
            />
            {me.isOwner ? (
              <select
                aria-label="Role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "manager")}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-ink"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
              </select>
            ) : null}
            <button type="submit" disabled={!!busy} className={`${primaryButton} shrink-0`}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {busy === "invite" ? "Sending…" : "Send invite"}
            </button>
          </div>
          {shareLink ? (
            <p className="mt-3 break-all rounded-xl bg-neutral-50 p-3 font-mono text-xs text-neutral-700">{shareLink}</p>
          ) : null}
          {me.isOwner ? (
            <p className="mt-3 text-xs text-neutral-500">
              Managers can see the schedule and invite or remove members. Only you can change commission, billing and
              payouts.
            </p>
          ) : null}
        </form>
      ) : null}

      {me.canManage && isPlus && earnings ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${card} p-5`}>
            <p className={eyebrow}>Shop cut paid this month</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCad(earnings.paidCents)}</p>
          </div>
          <div className={`${card} p-5`}>
            <p className={eyebrow}>Waiting to be paid</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCad(earnings.owedCents)}</p>
            {earnings.owedCents > 0 && !data!.payouts?.ready && me.isOwner ? (
              <p className="mt-1 text-xs text-neutral-500">Set up payouts in Settings to receive it.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className={`${card} divide-y divide-hairline`}>
        {team.map((m) => {
          const self = m.id === me.memberId;
          const stats = m.profileId ? earnings?.byMember?.[m.profileId] : undefined;
          const canRemove =
            m.role !== "owner" && (self || (me.canManage && (m.role !== "manager" || me.isOwner)));

          return (
            <li key={m.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600"
                  >
                    {(m.name || m.invitedEmail || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {m.status === "invited" ? m.invitedEmail : m.name || "New pro"}
                    {self ? <span className="font-normal text-neutral-500"> (you)</span> : null}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {m.status === "invited"
                      ? m.inviteExpired
                        ? "Invite expired"
                        : "Invited · waiting to join"
                      : roleLabel(m.role)}
                    {m.status === "active" && m.verificationStatus && m.verificationStatus !== "verified"
                      ? " · not verified yet"
                      : null}
                    {stats && me.canManage
                      ? ` · ${stats.bookings} ${stats.bookings === 1 ? "booking" : "bookings"} this month, ${formatCad(stats.salesCents)}`
                      : null}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {me.isOwner && m.status === "active" ? (
                  <CommissionInput
                    // Remounts with the saved value after each save.
                    key={`${m.id}-${m.commissionOverride}`}
                    member={m}
                    studioDefault={studio.commissionPercent}
                    disabled={!!busy}
                    onSave={(value) =>
                      update(
                        m,
                        { commissionPercent: value },
                        `cut-${m.id}`,
                        value === null ? "Back to the studio's default commission." : "Commission saved."
                      )
                    }
                  />
                ) : null}

                {me.isOwner && m.status === "active" && m.role !== "owner" ? (
                  <select
                    aria-label={`Role for ${m.name || "team member"}`}
                    value={m.role}
                    disabled={!!busy}
                    onChange={(e) =>
                      update(m, { role: e.target.value }, `role-${m.id}`, "Role updated.")
                    }
                    className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                  </select>
                ) : null}

                {me.canManage && m.status === "invited" ? (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={(e) => invite(e, m.id)}
                    className={secondaryButton}
                  >
                    {busy === `resend-${m.id}` ? "Sending…" : "Resend"}
                  </button>
                ) : null}

                {canRemove ? (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => remove(m)}
                    className="rounded-full px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:text-red-700"
                  >
                    {m.status === "invited" ? "Cancel" : self ? "Leave studio" : "Remove"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CommissionInput({
  member,
  studioDefault,
  disabled,
  onSave,
}: {
  member: TeamMember;
  studioDefault: number;
  disabled: boolean;
  onSave: (value: number | null) => void;
}) {
  const [value, setValue] = useState(member.commissionOverride === null ? "" : String(member.commissionOverride));

  const original = member.commissionOverride === null ? "" : String(member.commissionOverride);
  const changed = value.trim() !== original;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value.trim() === "" ? null : Number(value));
      }}
      className="flex items-center gap-1.5"
    >
      <label className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm">
        <span className="sr-only">Shop commission for {member.name || "this pro"}</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={STUDIO_MAX_COMMISSION_PERCENT}
          step="0.5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={String(studioDefault)}
          className="w-12 bg-transparent text-right tabular-nums outline-none placeholder:text-neutral-400"
        />
        <Percent className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
      </label>
      {changed ? (
        <button type="submit" disabled={disabled} className="text-sm font-medium text-ink underline underline-offset-4">
          Save
        </button>
      ) : null}
    </form>
  );
}

function SettingsView({
  data,
  busy,
  run,
  setNotice,
  reload,
  redirectTo,
}: SectionProps & { redirectTo: (path: string, body: unknown, key: string) => Promise<void> }) {
  const studio = data!.studio!;
  const payouts = data!.payouts;
  const [name, setName] = useState(studio.name);
  const [commission, setCommission] = useState(String(studio.commissionPercent));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run("settings", async () => {
      const res = await studioFetch("/api/studio/settings", {
        method: "PATCH",
        body: { name, commissionPercent: commission === "" ? 0 : Number(commission) },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not save settings." });
        return;
      }
      setNotice({ tone: "success", text: "Settings saved." });
      await reload();
    });
  }

  return (
    <section className="space-y-6">
      <form onSubmit={save} className={`${card} space-y-5 p-6 sm:p-8`}>
        <div>
          <label htmlFor="settings-name" className="mb-2 block text-sm font-medium text-neutral-800">
            Studio name
          </label>
          <input
            id="settings-name"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>

        <div>
          <label htmlFor="settings-commission" className="mb-2 block text-sm font-medium text-neutral-800">
            Shop commission
          </label>
          <div className="flex max-w-[12rem] items-center gap-2">
            <input
              id="settings-commission"
              type="number"
              inputMode="decimal"
              min={0}
              max={STUDIO_MAX_COMMISSION_PERCENT}
              step="0.5"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className={input}
            />
            <span className="text-sm text-neutral-500">%</span>
          </div>
          <p className="mt-2 max-w-xl text-xs leading-5 text-neutral-500">
            The shop&apos;s share of each booking a member gets paid for through LineUp, after LineUp&apos;s fee. Tips
            always go to the pro. Set a different rate for any pro in Team. Changes apply to bookings paid from now on,
            up to {STUDIO_MAX_COMMISSION_PERCENT}%.
            {studio.plan !== "studio_plus" || !studio.live ? " Takes effect on Studio Plus." : null}
          </p>
        </div>

        <button type="submit" disabled={!!busy} className={primaryButton}>
          {busy === "settings" ? "Saving…" : "Save settings"}
        </button>
      </form>

      <div className={`${card} p-6 sm:p-8`}>
        <h2 className="text-base font-semibold">Shop payouts</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-600">
          Where the shop&apos;s commission is paid. This is the shop&apos;s own account, separate from your personal
          payouts as a pro.
        </p>
        <p className="mt-3 text-sm font-medium text-ink">
          {payouts?.ready ? "Connected and ready" : payouts?.connected ? "Started, details still needed" : "Not set up"}
        </p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => redirectTo("/api/studio/payouts", {}, "payouts")}
          className={`mt-4 ${payouts?.ready ? secondaryButton : primaryButton}`}
        >
          {busy === "payouts"
            ? "Opening Stripe…"
            : payouts?.ready
            ? "Open payout dashboard"
            : payouts?.connected
            ? "Finish payout setup"
            : "Set up payouts"}
        </button>
      </div>

      <div className={`${card} p-6 sm:p-8`}>
        <h2 className="text-base font-semibold">Plan and billing</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {studio.live && studio.plan
            ? `${STUDIO_PLANS[studio.plan].label}, ${STUDIO_PLANS[studio.plan].priceLabel} CAD/mo${
                studio.periodEnd ? `. Renews ${new Date(studio.periodEnd).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}` : ""
              }.`
            : "No active plan."}
        </p>
        {studio.hasBilling ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => redirectTo("/api/studio/billing", { action: "portal" }, "portal")}
            className={`mt-4 ${secondaryButton}`}
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
      </div>

      {studio.live ? (
        <PlanPicker
          isOwner
          current={studio.plan}
          busy={busy}
          onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
          note="Switch plans any time. Stripe prorates the difference."
        />
      ) : null}

      <p className="text-xs text-neutral-500">
        Questions? <Link href="/contact" className="underline underline-offset-2">Contact LineUp</Link>.
      </p>
    </section>
  );
}
