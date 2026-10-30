"use client";

// Plan cards and the "no studio yet" screen.

import { useState } from "react";
import { Check } from "lucide-react";
import { STUDIO_PLANS, type StudioPlan } from "@/app/lib/plans";
import { studioFetch } from "./studioApi";
import { Button, Field, fieldClass, panelClass } from "./ui";
import type { SectionProps, StudioData } from "./types";

export function PlanPicker({
  isOwner,
  current,
  busy,
  onChoose,
  compact = false,
}: {
  isOwner: boolean;
  current: StudioPlan | null;
  busy: string | null;
  onChoose: (plan: StudioPlan) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
      {(Object.keys(STUDIO_PLANS) as StudioPlan[]).map((key) => {
        const plan = STUDIO_PLANS[key];
        const featured = key === "studio_plus";
        const isCurrent = current === key;
        return (
          <div
            key={key}
            className={`flex flex-col rounded-2xl p-6 ${
              featured ? "bg-ink text-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.55)]" : `${panelClass} text-ink`
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">{plan.label}</h3>
                <p className={`mt-0.5 text-[13px] ${featured ? "text-white/60" : "text-neutral-500"}`}>
                  {featured ? "Everything, plus pay and rent for the shop" : "Run the floor and take bookings"}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{plan.priceLabel}</span>
                <span className={`block text-xs ${featured ? "text-white/60" : "text-neutral-500"}`}>CAD a month</span>
              </p>
            </div>
            {!compact ? (
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className={`flex gap-2.5 text-sm leading-6 ${featured ? "text-white/85" : "text-neutral-700"}`}>
                    <Check className={`mt-1 h-4 w-4 shrink-0 ${featured ? "text-white" : "text-ink"}`} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
            {isCurrent ? (
              <p
                className={`mt-6 flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-medium ${
                  featured ? "bg-white/10 text-white" : "bg-ink/[0.05] text-ink"
                }`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Your current plan
              </p>
            ) : isOwner ? (
              <Button
                variant={featured ? "secondary" : "primary"}
                disabled={!!busy || isCurrent}
                loading={busy === `plan-${key}`}
                onClick={() => onChoose(key)}
                className={`mt-6 w-full ${featured ? "!bg-white !text-ink" : ""}`}
              >
                {isCurrent ? "Your plan" : current ? `Switch to ${plan.label}` : `Choose ${plan.label}`}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function NoStudio({ data, busy, run, setNotice, reload }: Omit<SectionProps, "data"> & { data: StudioData | null }) {
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
    <div className="mx-auto max-w-4xl">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-neutral-500">LineUp Studio</p>
        <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-[3.25rem]">
          Your whole shop, one calendar.
        </h1>
        <p className="mt-5 text-lg leading-8 text-neutral-600">
          Every pro keeps their own login. You see the floor, book walk-ins, set the shop&apos;s cut and collect rent. Your
          own clients pay no LineUp commission.
        </p>
      </div>

      {data?.invites?.length ? (
        <div className={`${panelClass} mt-10 divide-y divide-hairline`}>
          {data.invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              <p className="text-[15px] text-neutral-700">
                <span className="font-semibold text-ink">{invite.studioName}</span> invited you to their team.
              </p>
              {isProfessional ? (
                <Button variant="primary" loading={busy === `accept-${invite.id}`} onClick={() => accept(invite.id)}>
                  Join {invite.studioName}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {isProfessional ? (
        <form onSubmit={create} className={`${panelClass} mt-10 p-6 sm:p-8`}>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Create your studio</h2>
          <p className="mt-1 text-sm text-neutral-500">You&apos;ll be the owner. Invite your team and pick a plan next.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Shop or studio name" htmlFor="studio-name" className="flex-1">
              <input
                id="studio-name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Corner Cuts Barbershop"
                className={fieldClass}
              />
            </Field>
            <Button variant="primary" type="submit" loading={busy === "create"} className="h-11">
              Create studio
            </Button>
          </div>
        </form>
      ) : (
        <p className={`${panelClass} mt-10 p-6 text-sm text-neutral-600`}>
          Studio accounts are for professionals. This account is set up for booking services.
        </p>
      )}

      <div className="mt-14">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">One price for the whole shop</h2>
        <p className="mt-1 text-sm text-neutral-500">For teams of two or more. No charge per pro.</p>
        <div className="mt-5">
          <PlanPicker isOwner={false} current={null} busy={null} onChoose={() => {}} />
        </div>
      </div>
    </div>
  );
}
