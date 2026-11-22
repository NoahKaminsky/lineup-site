// The earnings core against LineUp's real commission rules. Fees are worked
// out with the same functions the payment code uses (app/lib/commission.ts),
// so if a rule there ever changes, these tests show what it does to earnings.
import { describe, expect, it } from "vitest";
import { platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import { giftCardFeeCents } from "@/app/lib/giftCards";
import {
  bookingEarnings,
  bookingVisitMoney,
  boothRentRow,
  giftCardSaleRow,
  shopAppointmentEarnings,
  shopVisitMoney,
  summarize,
  type BookingInput,
  type EarningsRow,
} from "@/app/lib/earningsCore";

const TODAY = "2026-11-22";
const standard = { subscription_plan: "pro", subscription_status: "active" };
const master = { subscription_plan: "master", subscription_status: "active" };

// A paid booking as the payment code would record it.
function paidBooking(opts: {
  priceCents: number;
  tipCents?: number;
  giftCents?: number;
  source?: "direct_booking" | "request";
  inLiveStudio?: boolean;
  profile?: typeof standard;
  shopCutPercent?: number;
  status?: string;
  refunded?: boolean;
}): BookingInput {
  const gift = opts.giftCents || 0;
  const charged = opts.priceCents - gift; // fee is on what's charged for the service
  const fee = platformFeeCentsFor({
    amountCents: charged,
    source: opts.source || "direct_booking",
    inLiveStudio: !!opts.inLiveStudio,
    profile: opts.profile || standard,
  });
  const split = splitBookingPayment({ amountCents: charged, platformFeeCents: fee, depositPercent: 20, studioCutPercent: opts.shopCutPercent || 0 });
  return {
    id: "b1",
    professional_id: "pro1",
    customer_id: "client1",
    studio_id: opts.inLiveStudio ? "shop1" : null,
    booking_date: "2026-11-10",
    status: opts.status || "completed",
    service_name: "TEST Haircut",
    service_price: opts.priceCents / 100,
    payment_status: "paid",
    refund_status: opts.refunded ? "refunded" : null,
    total_amount_cents: charged + (opts.tipCents || 0),
    platform_fee_cents: split.platformFeeCents,
    studio_cut_cents: split.studioCutCents,
    gift_card_cents: gift,
    membership_id: null,
    no_show_fee_cents: null,
    no_show_status: null,
    source: opts.source === "request" ? "request" : null,
    standing_id: null,
  };
}

const rowsOf = (b: BookingInput, cutPercent = 0) => bookingEarnings(b, { today: TODAY, cutPercent }).rows;
const net = (rows: EarningsRow[], scope: "me" | "shop") => summarize(rows, scope).net;

describe("bookings through LineUp", () => {
  it("standard booking: 15% commission out of the price", () => {
    const rows = rowsOf(paidBooking({ priceCents: 10000 }));
    const s = summarize(rows, "me");
    expect(s.grossServiceSales).toBe(10000);
    expect(s.lineupCommission).toBe(1500);
    expect(s.cardFees).toBe(0);
    expect(s.net).toBe(8500);
    expect(rows[0].source).toBe("lineup");
  });

  it("Master booking: 10% commission", () => {
    const s = summarize(rowsOf(paidBooking({ priceCents: 10000, profile: master })), "me");
    expect(s.lineupCommission).toBe(1000);
    expect(s.net).toBe(9000);
  });

  it("request booking always pays commission, even for a studio member", () => {
    const s = summarize(rowsOf(paidBooking({ priceCents: 10000, source: "request", inLiveStudio: true })), "me");
    expect(s.lineupCommission).toBe(1500);
    expect(s.cardFees).toBe(0);
    expect(s.net).toBe(8500);
  });

  it("studio member's own client: 0% commission, 2.9% + 30¢ card fee passed through", () => {
    const s = summarize(rowsOf(paidBooking({ priceCents: 10000, inLiveStudio: true })), "me");
    expect(s.lineupCommission).toBe(0);
    expect(s.cardFees).toBe(320); // 2.9% of $100 + 30¢
    expect(s.net).toBe(9680);
  });

  it("Studio Plus split: the shop's cut comes out after LineUp's fee", () => {
    const b = paidBooking({ priceCents: 10000, inLiveStudio: true, shopCutPercent: 20 });
    const rows = rowsOf(b);
    const pro = summarize(rows, "me");
    const shop = summarize(rows, "shop");
    expect(pro.shopCommission).toBe(1936); // 20% of $96.80
    expect(pro.net).toBe(7744);
    expect(shop.shopCommission).toBe(1936);
    expect(shop.net).toBe(1936);
    // Every cent accounted for: price = card fee + shop + pro.
    expect(pro.cardFees + pro.shopCommission + pro.net).toBe(10000);
  });

  it("a tip goes entirely to the pro and isn't charged commission", () => {
    const s = summarize(rowsOf(paidBooking({ priceCents: 10000, tipCents: 1800 })), "me");
    expect(s.tips).toBe(1800);
    expect(s.lineupCommission).toBe(1500);
    expect(s.net).toBe(10300);
  });

  it("a gift card that covers a booking in full counts once, when it was sold", () => {
    const sale = giftCardSaleRow({ id: "g1", professional_id: "pro1", amount_cents: 5000, buyer_name: "TEST Buyer", recipient_name: null }, "2026-11-01", "pro");
    const booking = rowsOf(paidBooking({ priceCents: 5000, giftCents: 5000 }));
    const s = summarize([sale, ...booking], "me");
    expect(s.giftCardSales).toBe(5000);
    expect(s.giftCardRedemptions).toBe(5000);
    expect(s.grossServiceSales).toBe(0); // not counted again
    expect(s.lineupCommission + s.cardFees).toBe(giftCardFeeCents(5000)); // no fee on the booking itself
    expect(s.net).toBe(5000 - giftCardFeeCents(5000));
  });

  it("a refund shows the sale and the refund, netting to zero", () => {
    const rows = rowsOf(paidBooking({ priceCents: 10000, tipCents: 1500, status: "cancelled", refunded: true }));
    const s = summarize(rows, "me");
    expect(s.grossServiceSales).toBe(10000);
    expect(s.tips).toBe(1500);
    expect(s.refunds).toBe(11500);
    expect(s.lineupCommission).toBe(0);
    expect(s.net).toBe(0);
  });
});

describe("booth rent", () => {
  it("is income to the shop (less card processing) and a cost to the pro", () => {
    const inv = { id: "in1", date: "2026-11-01", amount: 50000 };
    const shop = summarize([boothRentRow(inv, "shop", "pro1")], "shop");
    expect(shop.boothRent).toBe(50000);
    expect(shop.cardFees).toBe(1600); // 3.2%
    expect(shop.net).toBe(48400);
    const pro = summarize([boothRentRow(inv, "pro", "pro1")], "me");
    expect(pro.boothRent).toBe(50000);
    expect(pro.net).toBe(-50000);
  });
});

describe("money recorded by hand", () => {
  const walkIn = {
    id: "w1",
    studio_id: "shop1",
    professional_id: "pro1",
    kind: "walk_in" as const,
    client_name: "TEST Walk-in",
    service_name: "Fade",
    appointment_date: "2026-11-12",
    price_cents: 4000,
    shop_cut_cents: 800,
    status: "completed",
    paid_with: "cash",
    tip_cents: 500,
  };

  it("walk-in: counted from what the front desk recorded", () => {
    const { rows } = shopAppointmentEarnings(walkIn, TODAY);
    expect(rows[0].source).toBe("by_hand");
    expect(rows[0].paidVia).toBe("cash");
    const pro = summarize(rows, "me");
    expect(pro.recordedByHand).toBe(4500);
    expect(pro.net).toBe(3700); // 4000 - 800 + 500 tip
    expect(summarize(rows, "shop").net).toBe(800);
  });

  it("pay-at-shop booking: counted once marked done, shop's cut estimated", () => {
    const b: BookingInput = { ...paidBooking({ priceCents: 6000, inLiveStudio: true }), payment_status: "pay_at_shop", total_amount_cents: null, platform_fee_cents: null, studio_cut_cents: null };
    const rows = rowsOf(b, 20);
    expect(rows[0].type).toBe("pay_at_shop");
    expect(rows[0].source).toBe("by_hand");
    expect(rows[0].estimated).toBe(true);
    const s = summarize(rows, "me");
    expect(s.shopCommission).toBe(1200);
    expect(s.lineupCommission + s.cardFees).toBe(0); // never went through LineUp
    expect(s.net).toBe(4800);
  });

  it("imported appointment: never money", () => {
    const imported = { ...walkIn, kind: "imported" as const };
    expect(shopAppointmentEarnings(imported, TODAY).rows).toEqual([]);
    expect(shopVisitMoney(imported)).toEqual({ sales: 0, tip: 0, shop: 0, take: 0 });
  });
});

describe("one calculation everywhere", () => {
  it("net always equals what ended up with the pro or the shop", () => {
    const rows = [
      ...rowsOf(paidBooking({ priceCents: 10000, tipCents: 1000 })),
      ...rowsOf(paidBooking({ priceCents: 8000, inLiveStudio: true, shopCutPercent: 30 })),
      ...shopAppointmentEarnings({ id: "w2", studio_id: "shop1", professional_id: "pro1", kind: "walk_in", client_name: null, service_name: "Trim", appointment_date: "2026-11-11", price_cents: 3000, shop_cut_cents: 600, status: "completed", paid_with: "card", tip_cents: 0 }, TODAY).rows,
      boothRentRow({ id: "in2", date: "2026-11-01", amount: 40000 }, "shop", "pro1"),
    ];
    const s = summarize(rows, "me");
    expect(s.net).toBe(rows.reduce((t, r) => t + r.toProCents, 0));
    expect(net(rows, "shop")).toBe(rows.reduce((t, r) => t + r.toShopCents, 0));
  });

  it("analytics take-home matches earnings for the same booking", () => {
    const b = paidBooking({ priceCents: 10000, tipCents: 1500, inLiveStudio: true, shopCutPercent: 20 });
    expect(bookingVisitMoney(b, 20).take).toBe(summarize(rowsOf(b), "me").net);
  });

  it("upcoming bookings aren't earnings yet", () => {
    const b = { ...paidBooking({ priceCents: 10000 }), booking_date: "2026-12-01" };
    expect(rowsOf(b)).toEqual([]);
  });
});

describe("the statement (page and PDF) uses the same totals", () => {
  it("its lines add up to the shared net, for a pro and for a shop", async () => {
    const { buildStatement } = await import("@/app/lib/earningsStatement");
    const rows = [
      ...rowsOf(paidBooking({ priceCents: 10000, tipCents: 1000 })),
      ...rowsOf(paidBooking({ priceCents: 8000, inLiveStudio: true, shopCutPercent: 30 })),
      ...rowsOf(paidBooking({ priceCents: 5000, tipCents: 500, status: "cancelled", refunded: true })),
      giftCardSaleRow({ id: "g2", professional_id: "pro1", amount_cents: 2500, buyer_name: null, recipient_name: null }, "2026-11-03", "pro"),
      boothRentRow({ id: "in3", date: "2026-11-01", amount: 30000 }, "pro", "pro1"),
      ...shopAppointmentEarnings({ id: "w3", studio_id: "shop1", professional_id: "pro1", kind: "walk_in", client_name: null, service_name: "Trim", appointment_date: "2026-11-11", price_cents: 3000, shop_cut_cents: 600, status: "completed", paid_with: "cash", tip_cents: 200 }, TODAY).rows,
    ];
    for (const scope of ["me", "shop"] as const) {
      const st = buildStatement(rows, scope);
      expect(st.grossIncome - st.totalCosts).toBe(st.net);
      expect(st.net).toBe(summarize(rows, scope).net);
    }
  });
});

describe("where the money is", () => {
  it("20% sent at booking, the rest held until done, refunds owe nothing", async () => {
    const { payoutTotals } = await import("@/app/lib/earningsCore");
    const base = { payment_status: "paid", refund_status: null, studio_cut_cents: 0, stripe_studio_transfer_id: null };
    const bookings = [
      // Confirmed, deposit sent: $20 sent, $65 held (a $100 booking at 15%).
      { ...base, status: "confirmed", deposit_amount_cents: 2000, remaining_payout_cents: 6500, stripe_deposit_transfer_id: "tr_1", stripe_final_transfer_id: null },
      // Done and fully paid out.
      { ...base, status: "completed", deposit_amount_cents: 2000, remaining_payout_cents: 6500, stripe_deposit_transfer_id: "tr_2", stripe_final_transfer_id: "tr_3" },
      // Cancelled and refunded: the deposit was reversed.
      { ...base, status: "cancelled", refund_status: "refunded", deposit_amount_cents: 2000, remaining_payout_cents: 6500, stripe_deposit_transfer_id: "tr_4", stripe_final_transfer_id: null },
    ];
    expect(payoutTotals(bookings, "me")).toEqual({ sentToStripeCents: 2000 + 8500, heldUntilDoneCents: 6500, heldAfterDoneCents: 0 });
    const shop = [{ ...bookings[0], studio_cut_cents: 1936, stripe_studio_transfer_id: null }, { ...bookings[1], studio_cut_cents: 1000, stripe_studio_transfer_id: "tr_s" }];
    expect(payoutTotals(shop, "shop")).toEqual({ sentToStripeCents: 1000, heldUntilDoneCents: 1936, heldAfterDoneCents: 0 });
  });

  it("counts a no-show fee transfer, and flags money held after an appointment is done", async () => {
    const { payoutTotals } = await import("@/app/lib/earningsCore");
    const base = { refund_status: null, studio_cut_cents: 0, stripe_studio_transfer_id: null, deposit_amount_cents: 0, remaining_payout_cents: 0, stripe_deposit_transfer_id: null, stripe_final_transfer_id: null };
    const bookings = [
      // No-show charged $20: LineUp keeps 10%, $18 sent to the pro.
      { ...base, status: "cancelled", payment_status: "pay_at_shop", no_show_status: "charged", no_show_fee_cents: 2000, stripe_no_show_transfer_id: "tr_ns" },
      // Done, deposit sent, the rest never released.
      { ...base, status: "completed", payment_status: "paid", deposit_amount_cents: 800, remaining_payout_cents: 1512, stripe_deposit_transfer_id: "tr_d" },
    ];
    expect(payoutTotals(bookings, "me")).toEqual({ sentToStripeCents: 1800 + 800, heldUntilDoneCents: 1512, heldAfterDoneCents: 1512 });
  });
});
