"use client";

// Settings, grouped the way an owner thinks about the shop: how it appears to
// clients, how money is split, where it's paid, and the plan.

import { useState, type ReactNode } from "react";
import { STUDIO_MAX_COMMISSION_PERCENT } from "@/app/lib/commission";
import { STUDIO_PLANS } from "@/app/lib/plans";
import { studioFetch } from "./studioApi";
import { Button, Field, Tag, Toggle, fieldClass } from "./ui";
import { PlanPicker } from "./Plans";
import type { SectionProps } from "./types";

type RedirectTo = (path: string, body: unknown, key: string) => Promise<void>;

function Group({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-x-12 gap-y-5 border-t border-hairline py-9 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-neutral-500">{description}</p>
      </div>
      <div className="min-w-0 max-w-xl space-y-6">{children}</div>
    </section>
  );
}

export default function SettingsView({ data, busy, run, setNotice, reload, redirectTo }: SectionProps & { redirectTo: RedirectTo }) {
  const studio = data.studio!;
  const payouts = data.payouts;
  const [name, setName] = useState(studio.name);
  const [slug, setSlug] = useState(studio.slug || "");
  const [tagline, setTagline] = useState(studio.tagline || "");
  const [commission, setCommission] = useState(String(studio.commissionPercent));
  const [payAtShop, setPayAtShop] = useState(studio.payAtShop);
  const [noShowFee, setNoShowFee] = useState(String(studio.noShowFeePercent));

  const dirty =
    name !== studio.name ||
    slug !== (studio.slug || "") ||
    tagline !== (studio.tagline || "") ||
    Number(commission || 0) !== studio.commissionPercent ||
    payAtShop !== studio.payAtShop ||
    Number(noShowFee || 0) !== studio.noShowFeePercent;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run("settings", async () => {
      const res = await studioFetch("/api/studio/settings", {
        method: "PATCH",
        body: {
          name,
          slug,
          tagline,
          commissionPercent: commission === "" ? 0 : Number(commission),
          payAtShop,
          noShowFeePercent: noShowFee === "" ? 0 : Number(noShowFee),
        },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not save settings." });
        return;
      }
      setNotice({ tone: "success", text: "Settings saved." });
      await reload();
    });
  }

  const isPlus = studio.live && studio.plan === "studio_plus";

  return (
    <div>
      <form onSubmit={save}>
        <Group title="Your shop" description="How the shop appears on its booking page.">
          <Field label="Name" htmlFor="s-name">
            <input id="s-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Booking page link" htmlFor="s-slug" hint="Changing it breaks the old link anywhere you've posted it.">
            <div className="flex h-11 items-center overflow-hidden rounded-xl bg-surface text-sm shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] focus-within:shadow-[inset_0_0_0_1.5px_#0a0a0a]">
              <span className="shrink-0 pl-3.5 text-neutral-400">lineup-aesthetics.ca/shop/</span>
              <input
                id="s-slug"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-ink outline-none"
              />
            </div>
          </Field>
          <Field label="Tagline" htmlFor="s-tagline" optional>
            <input
              id="s-tagline"
              maxLength={160}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Fades, beards and hot towel shaves in the Exchange District"
              className={fieldClass}
            />
          </Field>
        </Group>

        <Group
          title="Payments"
          description="How money from bookings is split, and how clients can pay."
        >
          <Field
            label="Shop's cut"
            htmlFor="s-cut"
            hint={
              <>
                The shop&apos;s share of each booking paid through LineUp, after LineUp&apos;s fee. Tips always go to the pro. Change it
                for one pro from their profile in Team.
                {isPlus ? null : " Takes effect on Studio Plus."}
              </>
            }
          >
            <div className="relative w-36">
              <input
                id="s-cut"
                type="number"
                inputMode="decimal"
                min={0}
                max={STUDIO_MAX_COMMISSION_PERCENT}
                step="0.5"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className={`${fieldClass} pr-8 tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
            </div>
          </Field>

          <Toggle
            checked={payAtShop}
            onChange={setPayAtShop}
            label="Let clients pay at the shop"
            description="They book online and save a card instead of paying. Nothing is charged unless they don't show up."
          />
          {payAtShop ? (
            <Field
              label="No-show fee"
              htmlFor="s-noshow"
              hint="Charged to their card when the pro marks a no-show, 15 minutes after the start. Goes to the pro, minus LineUp's 10%."
            >
              <div className="relative w-36">
                <input
                  id="s-noshow"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={noShowFee}
                  onChange={(e) => setNoShowFee(e.target.value)}
                  className={`${fieldClass} pr-24 tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">% of price</span>
              </div>
            </Field>
          ) : null}
        </Group>

        <div className="sticky bottom-4 z-10 -mx-1 flex justify-end py-2">
          <div
            className={`flex items-center gap-3 rounded-full bg-surface p-1.5 pl-4 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_12px_32px_-12px_rgba(0,0,0,0.3)] transition-opacity duration-200 ${
              dirty ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!dirty}
          >
            <span className="text-sm text-neutral-600">Unsaved changes</span>
            <Button variant="primary" type="submit" loading={busy === "settings"} tabIndex={dirty ? 0 : -1}>
              Save changes
            </Button>
          </div>
        </div>
      </form>

      <Group
        title="Shop payouts"
        description="Where the shop's cut, booth rent and memberships are paid. The shop's own account, separate from your payouts as a pro."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {payouts?.ready ? <Tag tone="ink">Connected</Tag> : payouts?.connected ? <Tag tone="signal">Details needed</Tag> : <Tag>Not set up</Tag>}
          </div>
          <Button
            variant={payouts?.ready ? "secondary" : "primary"}
            loading={busy === "payouts"}
            onClick={() => redirectTo("/api/studio/payouts", {}, "payouts")}
          >
            {payouts?.ready ? "Open payout dashboard" : payouts?.connected ? "Finish setup" : "Set up payouts"}
          </Button>
        </div>
      </Group>

      <Group
        title="Plan and billing"
        description={
          studio.live && studio.plan
            ? `${STUDIO_PLANS[studio.plan].label}, ${STUDIO_PLANS[studio.plan].priceLabel} CAD a month${
                studio.periodEnd
                  ? `. Renews ${new Date(studio.periodEnd).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}`
                  : ""
              }.`
            : "No active plan."
        }
      >
        {studio.hasBilling ? (
          <div className="flex justify-end">
            <Button loading={busy === "portal"} onClick={() => redirectTo("/api/studio/billing", { action: "portal" }, "portal")}>
              Manage billing
            </Button>
          </div>
        ) : null}
        {studio.live ? (
          <PlanPicker
            compact
            isOwner
            current={studio.plan}
            busy={busy}
            onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
          />
        ) : null}
      </Group>
    </div>
  );
}
