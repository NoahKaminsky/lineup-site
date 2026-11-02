"use client";

// Setting up a shop: four short steps, one screen each.
//   1. The shop: name, address, what it offers
//   2. You: do you take clients yourself, or run the shop?
//   3. Your team: invite pros by email (skippable)
//   4. Plan (skippable)
// The shop exists after step 2, so a pro invited in step 3 can join straight
// away, and leaving mid-way lands on the shop's Today page.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Scissors, Store, X } from "lucide-react";
import { studioFetch } from "./studioApi";
import { AddressField, Button, ChipPicker, Field, fieldClass, panelClass, type PickedPlace } from "./ui";
import { PlanPicker } from "./Plans";
import type { RedirectTo } from "./StudioContext";
import { TRADES, type NoticeValue, type StudioData } from "./types";

type Props = {
  data: StudioData | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  setNotice: (n: NoticeValue) => void;
  reload: () => Promise<void>;
  redirectTo: RedirectTo;
};

const STEPS = ["Your shop", "You", "Your team", "Plan"] as const;

export default function ShopSetup({ data, busy, run, setNotice, reload, redirectTo }: Props) {
  const role = data?.role || null;
  const isPro = role === "professional";
  const canOpenShop = role === "professional" || role === "shop";

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [trades, setTrades] = useState<string[]>(() => (isPro ? data?.myTrades?.slice(0, 3) || [] : []));
  const [takesClients, setTakesClients] = useState<boolean>(isPro);
  const [myTrades, setMyTrades] = useState<string[]>(() => data?.myTrades || []);
  const [emails, setEmails] = useState<string[]>(["", ""]);

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

  function nextFromShop(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setNotice({ tone: "error", text: "Give your shop a name." });
    if (!trades.length) return setNotice({ tone: "error", text: "Pick at least one thing your shop offers." });
    setNotice(null);
    if (!myTrades.length) setMyTrades(trades.length === 1 ? trades : []);
    setStep(1);
  }

  async function createShop(e: React.FormEvent) {
    e.preventDefault();
    if (takesClients && !isPro && !myTrades.length) {
      return setNotice({ tone: "error", text: "Pick what you do so clients can book you." });
    }
    await run("create", async () => {
      const res = await studioFetch("/api/studio", {
        method: "POST",
        body: { name, place, trades, takesClients, myTrades: takesClients ? myTrades : [] },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not set up your shop." });
        return;
      }
      setStep(2);
    });
  }

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    const list = [...new Set(emails.map((x) => x.trim().toLowerCase()).filter(Boolean))];
    if (!list.length) {
      setStep(3);
      return;
    }
    await run("invite", async () => {
      const failed: string[] = [];
      for (const email of list) {
        const res = await studioFetch("/api/studio/invite", { method: "POST", body: { email, role: "member" } });
        if (!res.ok) failed.push(`${email}: ${res.data.error || "not sent"}`);
      }
      if (failed.length) {
        setNotice({ tone: "error", text: `Some invites didn't go out. ${failed.join(". ")}` });
        return;
      }
      setNotice({ tone: "success", text: `${list.length === 1 ? "Invite" : `${list.length} invites`} sent.` });
      setStep(3);
    });
  }

  async function finish() {
    await run("finish", async () => {
      await reload();
    });
  }

  if (!canOpenShop) {
    return (
      <div className="mx-auto max-w-xl pt-8">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.035em]">This account books as a client</h1>
        <p className="mt-3 text-[15px] leading-7 text-neutral-600">
          To run a shop on LineUp, sign up with the shop&apos;s own email and choose &ldquo;I run a shop&rdquo;. Your client
          account stays as it is.
        </p>
        <Link href="/requests" className="mt-6 inline-flex text-sm font-medium text-ink underline underline-offset-4">
          Back to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      {data?.invites?.length && step === 0 && isPro ? (
        <div className={`${panelClass} mb-8 divide-y divide-hairline`}>
          {data.invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm text-neutral-700">
                <span className="font-semibold text-ink">{invite.studioName}</span> invited you to their team.
              </p>
              <Button size="sm" variant="primary" loading={busy === `accept-${invite.id}`} onClick={() => accept(invite.id)}>
                Join
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Progress: a real sequence, so the steps are counted. */}
      <div className="flex items-center gap-3">
        {step > 0 && step < 2 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            aria-label="Back"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-ink/[0.06] hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <p className="text-[13px] font-medium text-neutral-500">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-ink" : "bg-ink/10"}`} />
        ))}
      </div>

      {step === 0 ? (
        <form onSubmit={nextFromShop} className="mt-10">
          <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[2.25rem]">Set up your shop</h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600">
            One calendar for the whole team, online booking, and client requests from people near you.
          </p>
          <div className="mt-8 space-y-6">
            <Field label="Shop name" htmlFor="shop-name">
              <input
                id="shop-name"
                required
                autoFocus
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Corner Cuts Barbershop"
                className={fieldClass}
              />
            </Field>
            <Field
              label="Address"
              htmlFor="shop-address"
              hint="Clients see it on your booking page. Pros and requests only ever see the area."
            >
              <AddressField id="shop-address" value={place?.address || ""} onPick={setPlace} />
            </Field>
            <Field label="What does the shop offer?">
              <ChipPicker label="What the shop offers" options={TRADES} value={trades} onChange={setTrades} />
            </Field>
          </div>
          <Button variant="primary" type="submit" className="mt-10 w-full sm:w-auto">
            Continue
          </Button>
        </form>
      ) : null}

      {step === 1 ? (
        <form onSubmit={createShop} className="mt-10">
          <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[2.25rem]">Do you take clients too?</h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600">
            Either way you run the shop: the calendar, the team, payouts and settings. You can change this later.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              on={takesClients}
              onClick={() => setTakesClients(true)}
              icon={<Scissors className="h-5 w-5" aria-hidden="true" />}
              title="Yes, I'm behind the chair"
              body="You get a column on the calendar and clients can book you."
            />
            <ChoiceCard
              on={!takesClients}
              onClick={() => setTakesClients(false)}
              icon={<Store className="h-5 w-5" aria-hidden="true" />}
              title="No, I run the shop"
              body="You manage everything. Only your team takes bookings."
            />
          </div>
          {takesClients && !isPro ? (
            <Field label="What do you do?" className="mt-8">
              <ChipPicker label="What you do" options={TRADES} value={myTrades} onChange={setMyTrades} />
            </Field>
          ) : null}
          <Button variant="primary" type="submit" loading={busy === "create"} className="mt-10 w-full sm:w-auto">
            Create {name.trim() || "my shop"}
          </Button>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={sendInvites} className="mt-10">
          <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[2.25rem]">Bring your team</h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600">
            Each pro gets an email to join. They keep their own login, clients and reviews, and show up on your calendar and
            booking page.
          </p>
          <div className="mt-8 space-y-2.5">
            {emails.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="email"
                  aria-label={`Email ${i + 1}`}
                  value={value}
                  onChange={(e) => setEmails(emails.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="pro@email.com"
                  className={fieldClass}
                />
                {emails.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setEmails(emails.filter((_, j) => j !== i))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-ink/[0.05] hover:text-ink"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            {emails.length < 10 ? (
              <button
                type="button"
                onClick={() => setEmails([...emails, ""])}
                className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-ink"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add another
              </button>
            ) : null}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <Button variant="primary" type="submit" loading={busy === "invite"}>
              Send invites
            </Button>
            <Button variant="ghost" onClick={() => setStep(3)}>
              Skip for now
            </Button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <div className="mt-10">
          <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[2.25rem]">Switch it on</h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600">
            One flat price for the whole shop, no charge per pro. Bookings, walk-ins, requests and chair openings start the
            moment you pick a plan.
          </p>
          <div className="mt-8">
            <PlanPicker
              isOwner
              current={null}
              busy={busy}
              onChoose={(plan) => redirectTo("/api/studio/billing", { action: "checkout", plan }, `plan-${plan}`)}
            />
          </div>
          <Button variant="ghost" loading={busy === "finish"} onClick={finish} className="mt-6">
            Decide later and open my shop
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChoiceCard({
  on,
  onClick,
  icon,
  title,
  body,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-[background-color,box-shadow] duration-150 ${
        on ? "bg-ink text-white" : `${panelClass} text-ink hover:shadow-[0_0_0_1px_rgba(10,10,10,0.2)]`
      }`}
    >
      {icon}
      <span>
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className={`mt-1 block text-[13px] leading-5 ${on ? "text-white/70" : "text-neutral-500"}`}>{body}</span>
      </span>
    </button>
  );
}
