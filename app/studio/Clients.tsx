"use client";

// Clients: the shop's own client list. Bring it over from your old booking
// app (a CSV export) or paste it in, then send everyone one email inviting
// them to book with you on LineUp. Each client gets that email once.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, Search, Trash2, Upload } from "lucide-react";
import { studioFetch } from "./studioApi";
import {
  Button,
  EmptyState,
  Section,
  Sheet,
  Tag,
  fieldClass,
  panelClass,
  textareaClass,
} from "./ui";
import { parseClientList, type ParsedClient } from "./clientImport";
import type { SectionProps } from "./types";

type Client = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  addedAt: string;
  invitedAt: string | null;
  unsubscribed: boolean;
  onLineUp: boolean;
};

type ClientsResponse = {
  ready: boolean;
  canSend?: boolean;
  shopUrl?: string | null;
  clients: Client[];
};

const PAGE = 100;

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export default function ClientsView({ data, setNotice }: SectionProps) {
  const studio = data.studio!;
  const [list, setList] = useState<ClientsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await studioFetch<ClientsResponse>("/api/studio/clients");
    if (res.ok) setList(res.data);
    else
      setNotice({
        tone: "error",
        text: res.data.error || "Could not load your clients.",
      });
    setLoading(false);
  }, [setNotice]);

  useEffect(() => {
    let cancelled = false;
    studioFetch<ClientsResponse>("/api/studio/clients").then((res) => {
      if (cancelled) return;
      if (res.ok) setList(res.data);
      else setNotice({ tone: "error", text: res.data.error || "Could not load your clients." });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [setNotice]);

  const clients = useMemo(() => list?.clients ?? [], [list]);
  const toInvite = clients.filter((c) => !c.invitedAt && !c.unsubscribed);
  const invited = clients.filter((c) => c.invitedAt).length;
  const joined = clients.filter((c) => c.onLineUp).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.email.includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q),
    );
  }, [clients, query]);

  async function remove(client: Client) {
    setRemoving(client.id);
    const res = await studioFetch("/api/studio/clients", {
      method: "POST",
      body: { action: "remove", id: client.id },
    });
    setRemoving(null);
    if (!res.ok)
      return setNotice({
        tone: "error",
        text: res.data.error || "Could not remove them.",
      });
    setList((prev) =>
      prev
        ? { ...prev, clients: prev.clients.filter((c) => c.id !== client.id) }
        : prev,
    );
  }

  if (loading && !list)
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        Loading your clients…
      </p>
    );

  if (list && !list.ready) {
    return (
      <EmptyState
        title="Client lists are almost ready"
        body="This part of LineUp is still being switched on. Check back soon."
      />
    );
  }

  return (
    <div className="space-y-12">
      <Section
        title="Your clients"
        description={`Bring over your client list, then invite everyone to book with ${studio.name} on LineUp. Each client gets one email, sent in your shop's name.`}
        actions={
          <>
            <Button onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Add clients
            </Button>
            <Button
              variant="primary"
              disabled={!toInvite.length}
              onClick={() => setInviting(true)}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              {toInvite.length ? `Invite ${toInvite.length}` : "Invite"}
            </Button>
          </>
        }
      >
        {clients.length ? (
          <>
            <dl className="grid grid-cols-3 gap-3">
              {[
                ["On your list", clients.length],
                ["Invited", invited],
                ["On LineUp", joined],
              ].map(([label, value]) => (
                <div key={label} className={`${panelClass} px-4 py-3`}>
                  <dt className="text-xs text-neutral-500">{label}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="relative mt-6">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search by name, email or phone"
                aria-label="Search clients"
                className={`${fieldClass} pl-10`}
              />
            </div>

            <ul className={`${panelClass} mt-3 divide-y divide-hairline`}>
              {filtered.slice(0, shown).map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {c.name || c.email}
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {c.name ? c.email : null}
                      {c.name && c.phone ? " · " : null}
                      {c.phone}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.onLineUp ? <Tag tone="ink">On LineUp</Tag> : null}
                    {c.unsubscribed ? (
                      <Tag tone="outline">Unsubscribed</Tag>
                    ) : c.invitedAt ? (
                      <Tag>Invited {shortDate(c.invitedAt)}</Tag>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${c.name || c.email}`}
                      loading={removing === c.id}
                      onClick={() => remove(c)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
              {!filtered.length ? (
                <li className="px-4 py-6 text-center text-sm text-neutral-500">
                  No one matches that.
                </li>
              ) : null}
            </ul>
            {filtered.length > shown ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Show more ({filtered.length - shown} left)
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No clients yet"
            body="Export your client list from your current booking app as a CSV file, or paste names and emails straight in."
            action={
              <Button variant="primary" onClick={() => setImporting(true)}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Add clients
              </Button>
            }
          />
        )}
      </Section>

      {/* Mounted only while open, so it starts empty each time. */}
      {importing ? (
        <ImportSheet
          open
          onClose={() => setImporting(false)}
          onDone={(text) => {
            setImporting(false);
            setNotice({ tone: "success", text });
            void load();
          }}
          onError={(text) => setNotice({ tone: "error", text })}
        />
      ) : null}

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        count={toInvite.length}
        canSend={!!list?.canSend}
        shopName={studio.name}
        shopUrl={list?.shopUrl || null}
        onDone={(text) => {
          setInviting(false);
          setNotice({ tone: "success", text });
          void load();
        }}
        onError={(text) => setNotice({ tone: "error", text })}
      />
    </div>
  );
}

function ImportSheet({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => parseClientList(text), [text]);

  async function readFile(file: File) {
    if (file.size > 5 * 1024 * 1024)
      return onError(
        "That file is over 5 MB. Export just names, emails and phone numbers.",
      );
    setFileName(file.name);
    setText(await file.text());
  }

  async function save() {
    const rows: ParsedClient[] = parsed.clients;
    setSaving(true);
    let added = 0;
    let already = 0;
    for (let i = 0; i < rows.length; i += 2000) {
      const res = await studioFetch<{ added: number; alreadyThere: number }>(
        "/api/studio/clients",
        {
          method: "POST",
          body: { action: "import", consent, rows: rows.slice(i, i + 2000) },
        },
      );
      if (!res.ok) {
        setSaving(false);
        return onError(res.data.error || "Could not add your clients.");
      }
      added += res.data.added;
      already += res.data.alreadyThere;
    }
    setSaving(false);
    onDone(
      `Added ${added} ${added === 1 ? "client" : "clients"}${already ? `. ${already} ${already === 1 ? "was" : "were"} already on your list` : ""}.`,
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add clients"
      description="Upload the CSV export from your current booking app, or paste a list with one client per line."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!parsed.clients.length || !consent}
            loading={saving}
            onClick={save}
          >
            {parsed.clients.length
              ? `Add ${parsed.clients.length} ${parsed.clients.length === 1 ? "client" : "clients"}`
              : "Add clients"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = "";
            }}
          />
          <Button className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {fileName ? `Chosen: ${fileName}` : "Choose a CSV file"}
          </Button>
          <p className="mt-2 text-xs leading-5 text-neutral-500">
            Squire, Booksy, Fresha, Vagaro and Square can all export clients as
            a CSV. We look for the name, email and phone columns, so you
            don&apos;t need to change the file.
          </p>
        </div>

        <div>
          <label
            htmlFor="client-paste"
            className="text-sm font-medium text-ink"
          >
            Or paste them here
          </label>
          <textarea
            id="client-paste"
            rows={6}
            value={fileName ? "" : text}
            onChange={(e) => {
              setFileName(null);
              setText(e.target.value);
            }}
            placeholder={
              "Jordan Lee, jordan@email.com, 204-555-0134\nsam@email.com"
            }
            className={`${textareaClass} mt-2 font-mono text-[13px]`}
          />
        </div>

        {text.trim() ? (
          <div className={`${panelClass} px-4 py-3 text-sm`}>
            <p className="font-medium text-ink">
              Found {parsed.clients.length}{" "}
              {parsed.clients.length === 1 ? "client" : "clients"} with an
              email.
            </p>
            {parsed.noEmail || parsed.duplicates ? (
              <p className="mt-1 text-neutral-500">
                {[
                  parsed.noEmail
                    ? `${parsed.noEmail} without an email left out`
                    : null,
                  parsed.duplicates
                    ? `${parsed.duplicates} repeats left out`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                .
              </p>
            ) : null}
            {parsed.clients.length ? (
              <ul className="mt-3 space-y-1 text-neutral-600">
                {parsed.clients.slice(0, 3).map((c) => (
                  <li key={c.email} className="truncate">
                    {c.name ? `${c.name} · ` : ""}
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </li>
                ))}
                {parsed.clients.length > 3 ? (
                  <li className="text-neutral-400">
                    and {parsed.clients.length - 3} more
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-ink"
          />
          <span>
            These are my shop&apos;s own clients, and each of them has booked
            with us in the last two years. I&apos;m allowed to email them about
            booking with us.
          </span>
        </label>
      </div>
    </Sheet>
  );
}

function InviteSheet({
  open,
  onClose,
  count,
  canSend,
  shopName,
  shopUrl,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  canSend: boolean;
  shopName: string;
  shopUrl: string | null;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    const res = await studioFetch<{ sent: number; failed: number }>(
      "/api/studio/clients",
      {
        method: "POST",
        body: { action: "invite", confirmCount: count },
      },
    );
    setSending(false);
    if (!res.ok && !res.data.sent)
      return onError(res.data.error || "The invites didn't send.");
    onDone(
      res.data.failed
        ? `Sent to ${res.data.sent}. ${res.data.failed} didn't go through; you can try those again.`
        : `Invites sent to ${res.data.sent} ${res.data.sent === 1 ? "client" : "clients"}.`,
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Invite ${count} ${count === 1 ? "client" : "clients"}`}
      description="Everyone on your list who hasn't been invited yet gets this email. You can only send it to each client once."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSend || !count}
            loading={sending}
            onClick={send}
          >
            Send {count} {count === 1 ? "invite" : "invites"}
          </Button>
        </>
      }
    >
      {!canSend ? (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          Your shop needs an active Studio plan and a booking page before you
          can send invites. Set up your booking link in Settings.
        </p>
      ) : null}
      <div className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-hairline px-4 py-3 text-xs leading-5 text-neutral-500">
          <p>
            <span className="text-neutral-400">From</span> {shopName} via LineUp
          </p>
          <p>
            <span className="text-neutral-400">Subject</span> {shopName} now
            takes bookings on LineUp
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm leading-6 text-neutral-700">
          <p className="text-lg font-semibold tracking-[-0.02em] text-ink">
            You can now book with us online.
          </p>
          <p>
            Hi Jordan, {shopName} is now on LineUp. You can see who&apos;s
            working, pick a service and book an open time whenever it suits you,
            without calling or messaging.
          </p>
          <span className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">
            Book with {shopName}
          </span>
          <p className="text-xs text-neutral-500">
            Replies go to your email. The button opens{" "}
            {shopUrl ? (
              <span className="break-all">{shopUrl}</span>
            ) : (
              "your booking page"
            )}
            . Every email has an unsubscribe link.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
