"use client";

// Team: the roster, one quiet row per pro. Everything you can change about a
// pro (role, how they're paid, removing them) lives in their sheet, so the
// list stays readable.

import { useState } from "react";
import { ChevronRight, UserPlus } from "lucide-react";
import { STUDIO_MAX_COMMISSION_PERCENT } from "@/app/lib/commission";
import { formatCad, studioFetch } from "./studioApi";
import { Avatar, Button, Field, Section, Segmented, Sheet, Tag, fieldClass, panelClass } from "./ui";
import { roleLabel, type SectionProps, type TeamMember } from "./types";

function rentStatus(status: string | null): { label: string; tone: "ink" | "muted" | "signal" } {
  if (status === "active" || status === "trialing") return { label: "Paying", tone: "muted" };
  if (status === "past_due" || status === "unpaid") return { label: "Payment failed", tone: "signal" };
  return { label: "Not set up", tone: "muted" };
}

function payLine(m: TeamMember, isPlus: boolean, studioDefault: number) {
  if (!isPlus) return null;
  if (m.arrangement === "booth_rent" && m.rentCents) {
    return `Booth rent, ${formatCad(m.rentCents)} a ${m.rentInterval === "week" ? "week" : "month"}`;
  }
  const cut = m.commissionOverride ?? studioDefault;
  return `Commission, shop keeps ${cut}%`;
}

export default function TeamView({ data, busy, run, setNotice, reload }: SectionProps) {
  const me = data.me!;
  const studio = data.studio!;
  const team = data.team || [];
  const earnings = data.earnings;
  const isPlus = studio.live && studio.plan === "studio_plus";
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = team.find((m) => m.id === openId) || null;

  const active = team.filter((m) => m.status === "active");
  const invited = team.filter((m) => m.status === "invited");
  const myRow = team.find((m) => m.id === me.memberId);

  return (
    <div className="space-y-12">
      {myRow && me.role !== "owner" ? <YourSpot member={myRow} studio={studio} isPlus={isPlus} busy={busy} run={run} setNotice={setNotice} /> : null}

      {me.canManage && isPlus && earnings ? (
        <div className="grid gap-px overflow-hidden rounded-2xl bg-hairline shadow-[0_0_0_1px_rgba(10,10,10,0.07)] sm:grid-cols-3">
          {[
            { label: "Shop's cut paid this month", value: formatCad(earnings.paidCents) },
            {
              label: "Waiting to be paid",
              value: formatCad(earnings.owedCents),
              hint: earnings.owedCents > 0 && !data.payouts?.ready && me.isOwner ? "Set up payouts in Settings" : null,
            },
            { label: "Shop's share of walk-ins", value: formatCad(earnings.inShopCutCents), hint: "Paid at the shop, for your records" },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-5 py-4">
              <p className="text-[13px] text-neutral-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{s.value}</p>
              {s.hint ? <p className="mt-0.5 text-xs text-neutral-500">{s.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <Section
        title="Your team"
        description={me.canManage ? "Select someone to change their role, how they're paid, or to remove them." : undefined}
        actions={
          me.canManage ? (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Invite a pro
            </Button>
          ) : null
        }
      >
        <ul className={`${panelClass} divide-y divide-hairline`}>
          {active.map((m) => {
            const self = m.id === me.memberId;
            const stats = m.profileId ? earnings?.byMember?.[m.profileId] : undefined;
            const clickable = me.canManage || self;
            const line = [
              roleLabel(m.role),
              me.canManage ? payLine(m, isPlus, studio.commissionPercent) : null,
              stats && me.canManage ? `${stats.bookings} this month, ${formatCad(stats.salesCents + stats.inShopSalesCents)}` : null,
            ]
              .filter(Boolean)
              .join(". ");
            const content = (
              <>
                <Avatar name={m.name} src={m.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                    <span className="truncate">{m.name || "New pro"}</span>
                    {self ? <span className="text-sm font-normal text-neutral-500">You</span> : null}
                    {m.verificationStatus && m.verificationStatus !== "verified" ? <Tag tone="outline">Not verified yet</Tag> : null}
                    {m.arrangement === "booth_rent" && me.canManage && rentStatus(m.rentStatus).tone === "signal" ? (
                      <Tag tone="signal">Rent failed</Tag>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-neutral-500">{line}</p>
                </div>
                {clickable ? <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" /> : null}
              </>
            );
            return (
              <li key={m.id}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ink/[0.025]"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3.5 px-5 py-4">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {me.canManage && invited.length ? (
        <Section title="Waiting to join" description="Invites last 14 days. Resend to give them a fresh link.">
          <ul className={`${panelClass} divide-y divide-hairline`}>
            {invited.map((m) => (
              <InviteRow key={m.id} member={m} canCancel={me.canManage} busy={busy} run={run} setNotice={setNotice} reload={reload} />
            ))}
          </ul>
        </Section>
      ) : null}

      <InviteSheet
        open={inviting}
        isOwner={me.isOwner}
        busy={busy}
        run={run}
        setNotice={setNotice}
        onClose={() => setInviting(false)}
        onSent={async () => {
          setInviting(false);
          await reload();
        }}
      />

      <MemberSheet
        member={open}
        data={data}
        busy={busy}
        run={run}
        setNotice={setNotice}
        reload={reload}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function YourSpot({
  member,
  studio,
  isPlus,
  busy,
  run,
  setNotice,
}: {
  member: TeamMember;
  studio: NonNullable<SectionProps["data"]["studio"]>;
  isPlus: boolean;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
}) {
  const paying = member.rentStatus === "active" || member.rentStatus === "trialing";
  const failed = member.rentStatus === "past_due" || member.rentStatus === "unpaid";

  async function rent(action: "setup" | "manage") {
    await run(`rent-${action}`, async () => {
      const res = await studioFetch<{ url?: string }>("/api/studio/rent", { method: "POST", body: { action } });
      if (!res.ok || !res.data.url) {
        setNotice({ tone: "error", text: res.data.error || "Something went wrong." });
        return;
      }
      window.location.assign(res.data.url);
    });
  }

  const booth = member.arrangement === "booth_rent" && member.rentCents;

  return (
    <div className={`${panelClass} p-6`}>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Your spot at {studio.name}</h2>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-neutral-600">
        {studio.live
          ? "The studio covers your plan, so you have Pro features without paying for your own."
          : "The studio doesn't have an active plan right now, so you're on your own plan."}
        {isPlus && !booth && member.effectiveCut
          ? ` The shop keeps ${member.effectiveCut}% of each booking after LineUp's fee. Tips are all yours.`
          : ""}
      </p>
      {booth ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-ink/[0.04] px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-ink">
              Booth rent, {formatCad(member.rentCents!)} a {member.rentInterval === "week" ? "week" : "month"}
            </p>
            <p className="mt-0.5 text-[13px] text-neutral-500">
              {paying
                ? `Paid by card automatically${
                    member.rentPaidUntil
                      ? `. Next on ${new Date(member.rentPaidUntil).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}`
                      : ""
                  }.`
                : failed
                ? "Your last payment didn't go through. Update your card."
                : "Set it up once and it comes out on schedule, straight to the shop."}
            </p>
          </div>
          <Button
            variant={paying ? "secondary" : "primary"}
            loading={busy === "rent-setup" || busy === "rent-manage"}
            onClick={() => rent(paying || failed ? "manage" : "setup")}
          >
            {paying ? "Manage rent" : failed ? "Update card" : "Set up rent payments"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function InviteRow({
  member,
  canCancel,
  busy,
  run,
  setNotice,
  reload,
}: {
  member: TeamMember;
  canCancel: boolean;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  reload: SectionProps["reload"];
}) {
  async function resend() {
    await run(`resend-${member.id}`, async () => {
      const res = await studioFetch<{ emailed?: boolean; joinUrl?: string }>("/api/studio/invite", {
        method: "POST",
        body: { resendMemberId: member.id },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not resend the invite." });
        return;
      }
      setNotice({
        tone: "success",
        text: res.data.emailed === false && res.data.joinUrl ? `Email didn't send. Share this link: ${res.data.joinUrl}` : "Invite sent again.",
      });
      await reload();
    });
  }

  async function cancel() {
    if (!window.confirm(`Cancel the invite to ${member.invitedEmail}?`)) return;
    await run(`remove-${member.id}`, async () => {
      const res = await studioFetch("/api/studio/members", { method: "DELETE", body: { memberId: member.id } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not cancel it." });
        return;
      }
      await reload();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3.5 px-5 py-4">
      <Avatar name={member.invitedEmail} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{member.invitedEmail}</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {member.inviteExpired ? "Invite expired" : "Invite sent"}, as {roleLabel(member.role).toLowerCase()}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {canCancel ? (
          <Button size="sm" variant="ghost" onClick={cancel} loading={busy === `remove-${member.id}`}>
            Cancel invite
          </Button>
        ) : null}
        <Button size="sm" onClick={resend} loading={busy === `resend-${member.id}`}>
          Resend
        </Button>
      </div>
    </li>
  );
}

function InviteSheet({
  open,
  isOwner,
  busy,
  run,
  setNotice,
  onClose,
  onSent,
}: {
  open: boolean;
  isOwner: boolean;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "manager">("member");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run("invite", async () => {
      const res = await studioFetch<{ emailed?: boolean; joinUrl?: string; warning?: string }>("/api/studio/invite", {
        method: "POST",
        body: { email, role },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not send the invite." });
        return;
      }
      setNotice(
        res.data.emailed === false && res.data.joinUrl
          ? { tone: "error", text: `The email didn't send. Share this link instead: ${res.data.joinUrl}` }
          : { tone: "success", text: `Invite sent to ${email}.` }
      );
      setEmail("");
      await onSent();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite a pro"
      description="They get an email to join your team. New pros create their own login; pros already on LineUp keep theirs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="invite-form" loading={busy === "invite"}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} className="space-y-5">
        <Field label="Email" htmlFor="invite-email">
          <input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={fieldClass}
          />
        </Field>
        {isOwner ? (
          <Field
            label="Role"
            hint={
              role === "manager"
                ? "Managers see the whole schedule, book walk-ins and invite or remove members. Pay, billing and payouts stay with you."
                : "Members manage their own bookings and see their own schedule."
            }
          >
            <Segmented
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "member", label: "Member" },
                { value: "manager", label: "Manager" },
              ]}
            />
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}

function MemberSheet({
  member,
  data,
  busy,
  run,
  setNotice,
  reload,
  onClose,
}: {
  member: TeamMember | null;
  data: SectionProps["data"];
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  reload: SectionProps["reload"];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={!!member}
      onClose={onClose}
      title={member?.name || "Team member"}
      description={member ? roleLabel(member.role) : undefined}
    >
      {member ? (
        <MemberSettings
          key={`${member.id}-${member.role}-${member.arrangement}-${member.commissionOverride}-${member.rentCents}-${member.rentInterval}`}
          member={member}
          data={data}
          busy={busy}
          run={run}
          setNotice={setNotice}
          reload={reload}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function MemberSettings({
  member,
  data,
  busy,
  run,
  setNotice,
  reload,
  onClose,
}: {
  member: TeamMember;
  data: SectionProps["data"];
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  reload: SectionProps["reload"];
  onClose: () => void;
}) {
  const me = data.me!;
  const studio = data.studio!;
  const isPlus = studio.live && studio.plan === "studio_plus";
  const self = member.id === me.memberId;
  const stats = member.profileId ? data.earnings?.byMember?.[member.profileId] : undefined;

  const [role, setRole] = useState<"member" | "manager">(member.role === "manager" ? "manager" : "member");
  const [arrangement, setArrangement] = useState<"commission" | "booth_rent">(member.arrangement || "commission");
  const [cut, setCut] = useState(member.commissionOverride === null ? "" : String(member.commissionOverride));
  const [rent, setRent] = useState(member.rentCents ? String(member.rentCents / 100) : "");
  const [interval, setRentInterval] = useState<"week" | "month">(member.rentInterval || "week");

  const editable = me.isOwner && member.role !== "owner";
  const canEditPay = editable && isPlus;
  const canEditCommission = editable;
  const canRemove = member.role !== "owner" && (self || (me.canManage && (member.role !== "manager" || me.isOwner)));

  async function call(path: string, method: string, body: Record<string, unknown>) {
    const res = await studioFetch(path, { method, body });
    if (!res.ok) throw new Error(res.data.error || "Could not save.");
  }

  async function save() {
    await run(`member-${member.id}`, async () => {
      try {
        if (me.isOwner && member.role !== "owner" && role !== member.role) {
          await call("/api/studio/members", "PATCH", { memberId: member.id, role });
        }
        if (canEditPay && arrangement === "booth_rent") {
          const cents = Math.round(Number(rent) * 100);
          const changed = member.arrangement !== "booth_rent" || cents !== member.rentCents || interval !== member.rentInterval;
          if (changed) {
            if (
              member.arrangement === "booth_rent" &&
              interval !== member.rentInterval &&
              (member.rentStatus === "active" || member.rentStatus === "trialing") &&
              !window.confirm("Switching between weekly and monthly ends their current rent at the end of this period. They'll set up the new schedule from their Studio page. Continue?")
            ) {
              return;
            }
            await call("/api/studio/rent", "PATCH", { memberId: member.id, arrangement: "booth_rent", rentCents: cents, rentInterval: interval });
          }
        } else if (canEditPay && arrangement === "commission" && member.arrangement === "booth_rent") {
          if (!window.confirm(`Switch ${member.name || "them"} to commission? Their rent stops after the period they've paid for.`)) return;
          await call("/api/studio/rent", "PATCH", { memberId: member.id, arrangement: "commission" });
        }
        if (canEditCommission && arrangement === "commission") {
          const next = cut.trim() === "" ? null : Number(cut);
          if (next !== member.commissionOverride) {
            await call("/api/studio/members", "PATCH", { memberId: member.id, commissionPercent: next });
          }
        }
        setNotice({ tone: "success", text: "Saved." });
        await reload();
        onClose();
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save." });
      }
    });
  }

  async function remove() {
    const what = self
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
        window.location.assign("/studio");
        return;
      }
      setNotice({ tone: "success", text: `${member.name || "They"} left the team.` });
      onClose();
      await reload();
    });
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3.5">
        <Avatar name={member.name} src={member.avatarUrl} size={56} />
        <div className="min-w-0 text-sm text-neutral-500">
          {stats ? (
            <p>
              <span className="font-semibold tabular-nums text-ink">{stats.bookings}</span> appointments this month,{" "}
              <span className="font-semibold tabular-nums text-ink">{formatCad(stats.salesCents + stats.inShopSalesCents)}</span> in sales
            </p>
          ) : (
            <p>No appointments yet this month.</p>
          )}
          {member.verificationStatus && member.verificationStatus !== "verified" ? (
            <p className="mt-0.5">Not verified yet, so not bookable on your shop page.</p>
          ) : null}
        </div>
      </div>

      {editable ? (
        <Field
          label="Role"
          hint={role === "manager" ? "Sees the whole schedule, books walk-ins, invites and removes members." : "Sees and manages their own bookings."}
        >
          <Segmented
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: "member", label: "Member" },
              { value: "manager", label: "Manager" },
            ]}
          />
        </Field>
      ) : null}

      {editable && isPlus ? (
        <div className="space-y-4">
          <Field label="How they're paid">
            <Segmented
              label="How they're paid"
              value={arrangement}
              onChange={setArrangement}
              options={[
                { value: "commission", label: "Commission" },
                { value: "booth_rent", label: "Booth rent" },
              ]}
            />
          </Field>

          {arrangement === "commission" ? (
            <Field
              label="Shop's cut"
              htmlFor="member-cut"
              hint={`Leave empty to use the studio default (${studio.commissionPercent}%). Taken after LineUp's fee; tips always go to the pro.`}
            >
              <div className="relative w-36">
                <input
                  id="member-cut"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={STUDIO_MAX_COMMISSION_PERCENT}
                  step="0.5"
                  value={cut}
                  onChange={(e) => setCut(e.target.value)}
                  placeholder={String(studio.commissionPercent)}
                  className={`${fieldClass} pr-8 tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
              </div>
            </Field>
          ) : (
            <Field
              label="Rent"
              htmlFor="member-rent"
              hint={
                member.arrangement === "booth_rent"
                  ? `${rentStatus(member.rentStatus).label}. Paid by card and sent straight to the shop, minus card processing.`
                  : "They set up card payments from their Studio page. It's sent straight to the shop, minus card processing."
              }
            >
              <div className="flex items-center gap-2">
                <div className="relative w-36">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
                  <input
                    id="member-rent"
                    type="number"
                    inputMode="decimal"
                    min={5}
                    max={10000}
                    step="1"
                    required
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                    className={`${fieldClass} pl-7 tabular-nums`}
                  />
                </div>
                <Segmented
                  label="Rent schedule"
                  size="sm"
                  value={interval}
                  onChange={setRentInterval}
                  options={[
                    { value: "week", label: "Weekly" },
                    { value: "month", label: "Monthly" },
                  ]}
                />
              </div>
            </Field>
          )}
        </div>
      ) : editable ? (
        <Field
          label="Shop's cut"
          htmlFor="member-cut"
          hint="Takes effect on Studio Plus. Leave empty to use the studio default."
        >
          <div className="relative w-36">
            <input
              id="member-cut"
              type="number"
              min={0}
              max={STUDIO_MAX_COMMISSION_PERCENT}
              step="0.5"
              value={cut}
              onChange={(e) => setCut(e.target.value)}
              placeholder={String(studio.commissionPercent)}
              className={`${fieldClass} pr-8 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
          </div>
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
        {canRemove ? (
          <Button variant="danger" onClick={remove} loading={busy === `remove-${member.id}`}>
            {self ? "Leave studio" : "Remove from team"}
          </Button>
        ) : (
          <span />
        )}
        {editable ? (
          <Button variant="primary" onClick={save} loading={busy === `member-${member.id}`}>
            Save changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}
