import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pro pages: every button and link styled as a pill or icon button is at
// least 44px tall (h-11 / min-h-11), so it's easy to hit on a phone.
const FILES = [
  "app/work/WorkPageClient.tsx", "app/requests/[id]/respond/page.tsx", "app/calendar/CalendarPageClient.tsx",
  "app/services/page.tsx", "app/components/WeeklyHoursEditor.tsx", "app/components/SchedulingControls.tsx",
  "app/components/earnings/EarningsReport.tsx", "app/components/earnings/TaxYear.tsx",
  "app/components/analytics/ProAnalytics.tsx", "app/import/page.tsx", "app/chairs/page.tsx", "app/subscription/page.tsx",
  "app/verification/VerificationPageClient.tsx", "app/refer/page.tsx", "app/gift-cards/page.tsx", "app/profile/[id]/ReviewReply.tsx",
];
const TAG = /<(?:button|Link|a)\b(?:[^>]|=>)*?className=(?:"([^"]*)"|\{`([^`]*)`)/gs;
const SMALL = /(?<![\w:-])(h-(?:7|8|9|10)|py-(?:0|0\.5|1|1\.5|2))(?![\w.])/;
// Already tall enough, or not a pill: heatmap cells, the calendar day strip, the on/off switch.
const OK = /(min-h-(11|\[44px\]|12)|h-1[1-9]|py-(2\.5|3|4)|w-12 shrink-0 snap-center|h-6 rounded|relative h-7 w-12)/;

describe("pro tap targets", () => {
  for (const f of FILES) {
    it(f, () => {
      const src = readFileSync(f, "utf8");
      const small = [...src.matchAll(TAG)].map((m) => m[1] ?? m[2]).filter((c) => SMALL.test(c) && !OK.test(c));
      expect(small).toEqual([]);
    });
  }
});
