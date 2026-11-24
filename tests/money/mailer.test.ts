import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => ({ data: { id: "e1" }, error: null }));
const batchSend = vi.fn(async () => ({ data: { data: [] }, error: null }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; batch = { send: batchSend }; } }));

import { emailDisabled, getMailer, guardMessage, isTestAddress } from "@/app/lib/mailer";

const msg = (to: string | string[]) => ({ from: "LineUp <hi@lineup.test>", to, subject: "Hi", html: "<p>hi</p>" });

describe("test addresses", () => {
  it("are the reserved domains only", () => {
    for (const a of ["lineup.test+customer@example.com", "A <x@example.org>", "x@mail.example.net", "x@shop.test", "x@a.invalid", "x@box.localhost"]) expect(isTestAddress(a), a).toBe(true);
    for (const a of ["noah@gmail.com", "x@examples.com", "x@example.com.au", "test@lineup-aesthetics.ca", "Pat <pat@testing.ca>"]) expect(isTestAddress(a), a).toBe(false);
  });
});

describe("guardMessage", () => {
  it("drops test recipients and keeps real ones", () => {
    expect(guardMessage(msg(["a@example.com", "real@gmail.com"]), {})?.to).toEqual(["real@gmail.com"]);
    expect(guardMessage(msg("real@gmail.com"), {})?.to).toBe("real@gmail.com");
    expect(guardMessage(msg("a@example.com"), {})).toBeNull();
    expect(guardMessage({ ...msg("real@gmail.com"), bcc: ["b@example.com", "c@gmail.com"] }, {})?.bcc).toEqual(["c@gmail.com"]);
  });
  it("sends nothing when EMAIL_DISABLED is on", () => {
    expect(emailDisabled({ EMAIL_DISABLED: "1" })).toBe(true);
    expect(emailDisabled({ EMAIL_DISABLED: "true" })).toBe(true);
    expect(emailDisabled({ EMAIL_DISABLED: "0" })).toBe(false);
    expect(emailDisabled({})).toBe(false);
    expect(guardMessage(msg("real@gmail.com"), { EMAIL_DISABLED: "1" })).toBeNull();
  });
});

describe("getMailer", () => {
  beforeEach(() => {
    send.mockClear();
    batchSend.mockClear();
    delete process.env.EMAIL_DISABLED;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("never calls Resend for a TEST account", async () => {
    const r = await getMailer().emails.send(msg("lineup.test+owner@example.com"));
    expect(r).toEqual({ data: null, error: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to real people, and logs a Resend error instead of losing it", async () => {
    await getMailer().emails.send(msg("real@gmail.com"));
    expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "bad" } } as never);
    const r = await getMailer().emails.send(msg("real@gmail.com"));
    expect(r.error).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
  });

  it("batches send only the real recipients; EMAIL_DISABLED stops the batch", async () => {
    await getMailer().batch.send([msg(["a@example.com"]), msg(["real@gmail.com"])]);
    expect(batchSend).toHaveBeenCalledWith([expect.objectContaining({ to: ["real@gmail.com"] })]);
    process.env.EMAIL_DISABLED = "1";
    batchSend.mockClear();
    await getMailer().batch.send([msg(["real@gmail.com"])]);
    expect(batchSend).not.toHaveBeenCalled();
  });
});
