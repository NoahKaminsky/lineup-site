"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, MapPin, Sparkles } from "lucide-react";
import LuLoader from "@/app/components/LuLoader";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { formatCad, studioFetch } from "@/app/studio/studioApi";
import { supabase } from "@/lib/supabaseClient";

// Chair openings for professionals: only chairs in their own trade(s).
// Studios post these from the Chairs tab on /studio.

type Opening = {
  id: string;
  title: string;
  studioName: string;
  studioSlug: string | null;
  professions: string[];
  arrangement: "booth_rent" | "commission" | "either";
  rentCents: number | null;
  rentInterval: "week" | "month" | null;
  commissionNote: string | null;
  description: string | null;
  requirements: string | null;
  resumeRequired: boolean;
  availableFrom: string | null;
  areaLabel: string | null;
  distanceKm: number | null;
  featured: boolean;
  postedAt: string;
  applied: string | null;
};

function moneyLine(o: Opening) {
  const rent = o.rentCents !== null ? `${formatCad(o.rentCents)} / ${o.rentInterval === "month" ? "month" : "week"}` : null;
  if (o.arrangement === "booth_rent") return rent ? `Booth rent · ${rent}` : "Booth rent";
  if (o.arrangement === "commission") return o.commissionNote ? `Commission · ${o.commissionNote}` : "Commission";
  return [rent ? `Rent ${rent}` : "Booth rent", o.commissionNote ? `or commission (${o.commissionNote})` : "or commission"].join(" ");
}

function postedAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  return `Posted ${days} days ago`;
}

export default function ChairsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const [composing, setComposing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // The application form (one opening at a time).
  const [years, setYears] = useState("");
  const [startDate, setStartDate] = useState("");
  const [preferred, setPreferred] = useState<"" | "booth_rent" | "commission" | "either">("");
  const [resume, setResume] = useState<File | null>(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    const res = await studioFetch<{ openings: Opening[]; professions: string[] }>("/api/chairs");
    if (res.status === 401) {
      router.push("/login?next=/chairs");
      return;
    }
    // Clients have no business here: send them to their dashboard rather
    // than showing a page that isn't for them.
    if (res.status === 403) {
      router.replace("/requests");
      return;
    }
    if (!res.ok) setError(res.data.error || "Could not load chair openings.");
    else {
      setOpenings(res.data.openings || []);
      setProfessions(res.data.professions || []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    (async () => {
      if (!(await getSignedInUser())) {
        router.push("/login?next=/chairs");
        return;
      }
      await load();
    })();
  }, [load, router]);

  function openForm(id: string) {
    setComposing(id);
    setMessage("");
    setYears("");
    setStartDate("");
    setPreferred("");
    setResume(null);
    setFormError("");
  }

  // Resume first (straight to private storage with a signed token), then
  // the application itself.
  async function uploadResume(file: File) {
    const start = await studioFetch<{ path: string; token: string }>("/api/chairs/resume-upload", {
      method: "POST",
      body: { contentType: file.type, size: file.size },
    });
    if (!start.ok) throw new Error(start.data.error || "Could not upload your resume.");
    const { error: uploadError } = await supabase.storage
      .from("chair-resumes")
      .uploadToSignedUrl(start.data.path, start.data.token, file, { contentType: file.type });
    if (uploadError) throw new Error("Could not upload your resume. Try again.");
    return start.data.path;
  }

  async function apply(o: Opening) {
    setFormError("");
    if (o.resumeRequired && !resume) {
      setFormError("This shop asks for a resume. Attach one to apply.");
      return;
    }
    setSending(true);
    try {
      const resumePath = resume ? await uploadResume(resume) : null;
      const res = await studioFetch("/api/chairs/apply", {
        method: "POST",
        body: {
          openingId: o.id,
          message,
          yearsExperience: years === "" ? null : Number(years),
          availableFrom: startDate || null,
          preferredArrangement: preferred || null,
          resumePath,
        },
      });
      if (!res.ok) {
        setFormError(res.data.error || "Could not send your application.");
        return;
      }
      setOpenings((prev) => prev.map((x) => (x.id === o.id ? { ...x, applied: "new" } : x)));
      setComposing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not send your application.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LuLoader />;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl py-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Chair openings</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-neutral-600">
          Shops and studios on LineUp looking for pros in your trade
          {professions.length ? ` (${professions.join(", ")})` : ""}. Only professionals in the same trade can see these.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {openings.length === 0 && !error ? (
          <div className="mt-8 rounded-panel bg-surface ring-1 ring-ink/[0.06] p-6 text-sm leading-6 text-neutral-600">
            No chairs open in your trade right now. When a shop near you posts one, you&apos;ll get a notification.
          </div>
        ) : (
          <ul className="lu-lineup mt-8 space-y-4">
            {openings.map((o) => (
              <li key={o.id} className="rounded-panel bg-surface ring-1 ring-ink/[0.06] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {o.featured ? (
                      <span className="mb-2 inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-white">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Featured
                      </span>
                    ) : null}
                    <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">{o.title}</h2>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {o.studioSlug ? (
                        <Link href={`/shop/${o.studioSlug}`} className="font-medium text-ink underline decoration-neutral-300 underline-offset-4">
                          {o.studioName}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{o.studioName}</span>
                      )}
                      {" · "}
                      {o.professions.join(", ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">{postedAgo(o.postedAt)}</span>
                </div>

                <p className="mt-3 text-sm font-semibold text-ink">{moneyLine(o)}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                  {o.areaLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {o.areaLabel}
                      {o.distanceKm !== null ? <span className="text-neutral-400"> · {o.distanceKm} km away</span> : null}
                    </span>
                  ) : null}
                  {o.availableFrom ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      From {new Date(`${o.availableFrom}T00:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}
                    </span>
                  ) : null}
                </div>

                {o.description ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-700">{o.description}</p> : null}

                {o.requirements || o.resumeRequired ? (
                  <div className="mt-3 rounded-xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">
                    <p className="font-medium text-ink">What they&apos;re looking for</p>
                    {o.requirements ? <p className="mt-1 whitespace-pre-line">{o.requirements}</p> : null}
                    {o.resumeRequired ? <p className="mt-1">A resume is required to apply.</p> : null}
                  </div>
                ) : null}

                <div className="mt-4">
                  {o.applied ? (
                    <span className="inline-flex rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700">
                      {o.applied === "invited" ? "They've invited you. Check your email." : "Application sent. The shop will reach out."}
                    </span>
                  ) : composing === o.id ? (
                    <form
                      className="space-y-4 rounded-2xl border border-hairline p-4 sm:p-5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        apply(o);
                      }}
                    >
                      <p className="text-sm font-semibold text-ink">Apply for this chair</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="font-medium text-ink">Years of experience</span>
                          <input
                            type="number"
                            min={0}
                            max={60}
                            inputMode="numeric"
                            value={years}
                            onChange={(e) => setYears(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:bg-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="font-medium text-ink">When could you start?</span>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:bg-white"
                          />
                        </label>
                      </div>
                      {o.arrangement === "either" ? (
                        <fieldset className="text-sm">
                          <legend className="font-medium text-ink">How you&apos;d like to work</legend>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {(
                              [
                                ["booth_rent", "Booth rent"],
                                ["commission", "Commission"],
                                ["either", "Either"],
                              ] as const
                            ).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={preferred === value}
                                onClick={() => setPreferred(preferred === value ? "" : value)}
                                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                                  preferred === value ? "border-ink bg-ink text-white" : "border-neutral-200 text-neutral-700 hover:border-ink"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}
                      <label className="block text-sm">
                        <span className="font-medium text-ink">
                          Resume{" "}
                          <span className="font-normal text-neutral-500">{o.resumeRequired ? "(required)" : "(optional)"}</span>
                        </span>
                        <span className="mt-1.5 flex items-center gap-3 rounded-xl bg-ink/[0.03] px-4 py-3">
                          <FileText className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-neutral-600">{resume ? resume.name : "PDF or Word, up to 5 MB"}</span>
                          <span className="shrink-0 font-medium text-ink underline underline-offset-4">{resume ? "Change" : "Choose file"}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              if (file && file.size > 5 * 1024 * 1024) {
                                setFormError("Resumes must be 5 MB or smaller.");
                                return;
                              }
                              setFormError("");
                              setResume(file);
                            }}
                          />
                        </span>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-ink">
                          Note to the shop <span className="font-normal text-neutral-500">(optional)</span>
                        </span>
                        <textarea
                          rows={3}
                          maxLength={800}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="What you specialize in, why this shop, anything they should know."
                          className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
                        />
                      </label>
                      {formError ? (
                        <p role="alert" className="text-sm text-red-600">
                          {formError}
                        </p>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={sending}
                          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                        >
                          {sending ? "Sending…" : "Send application"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposing(null)}
                          className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-500 hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500">The shop also sees your LineUp profile, portfolio and reviews.</p>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openForm(o.id)}
                      className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                    >
                      Apply
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
