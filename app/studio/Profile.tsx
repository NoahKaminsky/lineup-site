"use client";

// The shop's public profile, edited in one place: what clients see on
// lineup-aesthetics.ca/shop/<link> before they choose to book. Cover and
// logo, a photo gallery, about, opening hours, contact links, amenities, and
// the shop's reviews with a reply box.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ExternalLink, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Photo } from "@/app/components/Photo";
import { studioFetch } from "./studioApi";
import { Button, ChipPicker, Field, Toggle, fieldClass, panelClass, textareaClass } from "./ui";
import { AMENITIES, DAY_NAMES, reviewSummary, type WeekHours } from "@/app/lib/shopProfile";
import type { SectionProps } from "./types";

type ProfileData = {
  canEdit: boolean;
  profile: {
    about: string | null;
    cover_url: string | null;
    logo_url: string | null;
    phone: string | null;
    website: string | null;
    instagram: string | null;
    hours: WeekHours | null;
    amenities: string[] | null;
  } | null;
  photos: { id: string; url: string; caption: string | null }[];
  reviews: { id: string; rating: number; comment: string | null; reply: string | null; created_at: string; reviewer: string }[];
};

const DEFAULT_DAY: [string, string] = ["09:00", "18:00"];

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

async function uploadPhoto(file: File, kind: "cover" | "logo" | "gallery") {
  const start = await studioFetch<{ path?: string; token?: string; error?: string }>("/api/studio/profile/photos", {
    method: "POST",
    body: { action: "upload-url", contentType: file.type, size: file.size },
  });
  if (!start.ok || !start.data.path || !start.data.token) throw new Error(start.data.error || "Could not start the upload.");
  const { error } = await supabase.storage.from("portfolio-images").uploadToSignedUrl(start.data.path, start.data.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const done = await studioFetch<{ error?: string }>("/api/studio/profile/photos", { method: "POST", body: { action: "add", path: start.data.path, kind } });
  if (!done.ok) throw new Error(done.data.error || "Could not save the photo.");
}

export default function ProfileView({ data, setNotice }: SectionProps) {
  const studio = data.studio!;
  const [p, setP] = useState<ProfileData | null>(null);
  const [tick, setTick] = useState(0);
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [teamHours, setTeamHours] = useState(true);
  const [hours, setHours] = useState<Record<number, [string, string] | null>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    studioFetch<ProfileData & { error?: string }>("/api/studio/profile").then((res) => {
      if (cancelled) return;
      if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "We couldn't load the shop profile." });
      setP(res.data);
      const pr = res.data.profile;
      setAbout(pr?.about || "");
      setPhone(pr?.phone || "");
      setWebsite(pr?.website || "");
      setInstagram(pr?.instagram ? `@${pr.instagram}` : "");
      setAmenities(pr?.amenities || []);
      setTeamHours(!pr?.hours);
      const h: Record<number, [string, string] | null> = {};
      for (let d = 0; d < 7; d++) {
        const w = pr?.hours?.[d]?.[0];
        h[d] = w ? [w[0], pr!.hours![d][pr!.hours![d].length - 1][1]] : null;
      }
      setHours(h);
    });
    return () => {
      cancelled = true;
    };
  }, [tick, setNotice]);

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = { about, phone, website, instagram, amenities };
    if (teamHours) body.hours = null;
    else {
      const out: Record<number, [string, string][]> = {};
      for (let d = 0; d < 7; d++) if (hours[d]) out[d] = [hours[d]!];
      body.hours = out;
    }
    const res = await studioFetch<{ error?: string }>("/api/studio/profile", { method: "PATCH", body });
    setSaving(false);
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Could not save." });
    setNotice({ tone: "success", text: "Saved. Your shop page is up to date." });
    setTick((n) => n + 1);
  }

  async function onFiles(files: FileList | null, kind: "cover" | "logo" | "gallery") {
    if (!files?.length) return;
    setUploading(kind);
    try {
      for (const f of Array.from(files).slice(0, kind === "gallery" ? 10 : 1)) await uploadPhoto(f, kind);
      setTick((n) => n + 1);
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not upload that photo." });
    } finally {
      setUploading(null);
    }
  }

  async function removePhoto(q: string) {
    const res = await studioFetch<{ error?: string }>(`/api/studio/profile/photos?${q}`, { method: "DELETE" });
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Could not remove it." });
    setTick((n) => n + 1);
  }

  if (!p) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the shop profile">
        <div className="h-48 animate-pulse rounded-2xl bg-ink/[0.05]" />
        <div className="h-32 animate-pulse rounded-2xl bg-ink/[0.05]" />
      </div>
    );
  }
  const pr = p.profile;
  const canEdit = p.canEdit;
  const summary = reviewSummary(p.reviews);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Shop profile</h2>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            What clients see before they book: photos, hours, where you are and what people say. A full profile gets more bookings.
          </p>
        </div>
        {studio.slug ? (
          <a href={`/shop/${studio.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            View your page
          </a>
        ) : null}
      </div>

      <Group title="Cover and logo" description="The big photo across the top of your page, and a small logo beside your name. A bright photo of the shop works best.">
        <div className={`${panelClass} overflow-hidden`}>
          <div className="relative aspect-[16/7] bg-ink/[0.05]">
            {pr?.cover_url ? <Photo src={pr.cover_url} alt="" width={1200} sizes="(min-width: 768px) 576px, 100vw" className="absolute inset-0 h-full w-full object-cover" /> : null}
            {!pr?.cover_url ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-neutral-500">
                <Camera className="h-5 w-5" aria-hidden="true" />
                No cover photo yet
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-4 p-4">
            <div className="relative -mt-12 h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-surface ring-4 ring-surface">
              {pr?.logo_url ? (
                <Photo src={pr.logo_url} alt="" width={256} sizes="64px" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-ink text-xl font-semibold text-white">{studio.name.slice(0, 1)}</span>
              )}
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <UploadButton label={pr?.cover_url ? "Change cover" : "Add cover"} busy={uploading === "cover"} onFiles={(f) => onFiles(f, "cover")} />
                <UploadButton label={pr?.logo_url ? "Change logo" : "Add logo"} busy={uploading === "logo"} onFiles={(f) => onFiles(f, "logo")} />
                {pr?.cover_url ? (
                  <Button variant="ghost" size="sm" onClick={() => removePhoto("kind=cover")}>
                    Remove cover
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Group>

      <Group title="Photos" description={`The space, the chairs, the work. Up to 30; clients swipe through them on your page. ${p.photos.length} added.`}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {p.photos.map((ph) => (
            <div key={ph.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.05]">
              <Photo src={ph.url} alt={ph.caption || "Shop photo"} width={384} sizes="150px" className="absolute inset-0 h-full w-full object-cover" />
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => removePhoto(`id=${ph.id}`)}
                  aria-label="Remove this photo"
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {canEdit && p.photos.length < 30 ? (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium text-neutral-600 shadow-[inset_0_0_0_1.5px_rgba(10,10,10,0.12)] transition-colors hover:bg-ink/[0.03] hover:text-ink">
              {uploading === "gallery" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
              {uploading === "gallery" ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => onFiles(e.target.files, "gallery")} />
            </label>
          ) : null}
        </div>
      </Group>

      <Group title="About" description="A few lines on the shop: your style, who you are, what makes a visit good.">
        <Field label="About the shop" htmlFor="sp-about" optional>
          <textarea id="sp-about" rows={5} maxLength={1500} disabled={!canEdit} value={about} onChange={(e) => setAbout(e.target.value)} className={textareaClass} placeholder="A neighbourhood shop for sharp cuts and easy conversation…" />
        </Field>
      </Group>

      <Group title="Opening hours" description="Shown on your page with “Open now”. Or use your team's working hours, combined.">
        <Toggle label="Use the team's hours" checked={teamHours} onChange={(v) => canEdit && setTeamHours(v)} />
        {!teamHours ? (
          <ul className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const name = DAY_NAMES[d];
              const w = hours[d];
              return (
                <li key={name} className="flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 w-32 items-center gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={!!w}
                      disabled={!canEdit}
                      onChange={(e) => setHours((h) => ({ ...h, [d]: e.target.checked ? DEFAULT_DAY : null }))}
                      className="h-5 w-5 accent-ink"
                    />
                    {name}
                  </label>
                  {w ? (
                    <div className="flex items-center gap-2">
                      <input type="time" aria-label={`${name} opens`} value={w[0]} disabled={!canEdit} onChange={(e) => setHours((h) => ({ ...h, [d]: [e.target.value, w[1]] }))} className={`${fieldClass} w-32`} />
                      <span className="text-sm text-neutral-500">to</span>
                      <input type="time" aria-label={`${name} closes`} value={w[1]} disabled={!canEdit} onChange={(e) => setHours((h) => ({ ...h, [d]: [w[0], e.target.value] }))} className={`${fieldClass} w-32`} />
                    </div>
                  ) : (
                    <span className="text-sm text-neutral-500">Closed</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Group>

      <Group title="Contact" description="How clients reach you. All optional; only what you fill in shows.">
        <Field label="Phone" htmlFor="sp-phone" optional>
          <input id="sp-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} disabled={!canEdit} onChange={(e) => setPhone(e.target.value)} className={fieldClass} placeholder="204-555-0123" />
        </Field>
        <Field label="Instagram" htmlFor="sp-ig" optional>
          <input id="sp-ig" value={instagram} disabled={!canEdit} onChange={(e) => setInstagram(e.target.value)} className={fieldClass} placeholder="@yourshop" />
        </Field>
        <Field label="Website" htmlFor="sp-web" optional>
          <input id="sp-web" type="url" inputMode="url" value={website} disabled={!canEdit} onChange={(e) => setWebsite(e.target.value)} className={fieldClass} placeholder="yourshop.ca" />
        </Field>
      </Group>

      <Group title="Good to know" description="Tick what's true. Clients often check these before they book.">
        {canEdit ? (
          <ChipPicker label="Amenities" options={AMENITIES.map((a) => ({ value: a, label: a }))} value={amenities} onChange={setAmenities} />
        ) : (
          <p className="text-sm text-neutral-600">{amenities.join(" · ") || "None ticked yet."}</p>
        )}
      </Group>

      {canEdit ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 flex justify-end py-4 sm:bottom-4">
          <Button variant="primary" onClick={save} loading={saving}>
            Save profile
          </Button>
        </div>
      ) : null}

      <Group
        title="Reviews"
        description={
          summary.count
            ? `${summary.average} out of 5 from ${summary.count} ${summary.count === 1 ? "review" : "reviews"}. Clients review the shop after a completed visit.`
            : "Clients can review the shop after a completed visit. A short, kind reply shows people you care."
        }
      >
        {p.reviews.length ? (
          <ul className="space-y-3">
            {p.reviews.map((r) => (
              <ReviewRow key={r.id} review={r} canReply={canEdit} onSaved={() => setTick((n) => n + 1)} setNotice={setNotice} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No reviews yet.</p>
        )}
      </Group>
    </div>
  );
}

function UploadButton({ label, busy, onFiles }: { label: string; busy: boolean; onFiles: (f: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <Button size="sm" onClick={() => ref.current?.click()} loading={busy}>
        <Camera className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => onFiles(e.target.files)} />
    </>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden="true" style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-ink text-ink" : "fill-transparent text-neutral-300"} />
      ))}
    </span>
  );
}

function ReviewRow({
  review,
  canReply,
  onSaved,
  setNotice,
}: {
  review: ProfileData["reviews"][number];
  canReply: boolean;
  onSaved: () => void;
  setNotice: SectionProps["setNotice"];
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(review.reply || "");
  const [saving, setSaving] = useState(false);
  async function send() {
    setSaving(true);
    const res = await studioFetch<{ error?: string }>("/api/shop-reviews", { method: "PATCH", body: { id: review.id, reply } });
    setSaving(false);
    if (!res.ok) return setNotice({ tone: "error", text: res.data.error || "Could not save your reply." });
    setOpen(false);
    onSaved();
  }
  return (
    <li className={`${panelClass} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{review.reviewer}</p>
        <Stars value={review.rating} />
      </div>
      {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-700">{review.comment}</p> : null}
      <p className="mt-1.5 text-xs text-neutral-500">{new Date(review.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</p>
      {review.reply && !open ? (
        <div className="mt-3 rounded-xl bg-ink/[0.04] p-3 text-sm leading-6 text-neutral-700">
          <span className="font-medium text-ink">Your reply: </span>
          {review.reply}
        </div>
      ) : null}
      {canReply ? (
        open ? (
          <div className="mt-3 space-y-2">
            <textarea rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} className={textareaClass} aria-label="Your reply" placeholder="Thanks for coming in…" />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={send} loading={saving}>
                Post reply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
            {review.reply ? "Edit reply" : "Reply"}
          </Button>
        )
      ) : null}
    </li>
  );
}
