// Reads the sample exports in this folder and prints what the import review
// would show. Run with:  npx tsx test-fixtures/calendar-import/check.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIcs } from "@/app/lib/calendarImport/ics";
import { csvRows, readCsv } from "@/app/lib/calendarImport/csv";
import type { ParsedFile, TeamPro } from "@/app/lib/calendarImport/types";

const team: TeamPro[] = [
  { id: "alex", name: "Alex Rivera" },
  { id: "sam", name: "Sam Roberts" },
  { id: "jamie", name: "Jamie Chen" },
];
const dir = join(process.cwd(), "test-fixtures/calendar-import");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

function show(name: string, parsed: ParsedFile) {
  console.log(`\n=== ${name}: ${parsed.rows.length} appointments, ${parsed.skipped.length} skipped`);
  for (const r of parsed.rows.slice(0, 40)) {
    console.log(
      `${r.date} ${r.start}-${r.end}  pro=${r.proId ?? "-"}(${r.confidence})  client=${r.clientName ?? "-"}  ` +
        `service=${r.service ?? "-"}  phone=${r.clientPhone ?? "-"}  email=${r.clientEmail ?? "-"}${r.repeating ? "  [repeat]" : ""}`
    );
  }
  if (parsed.rows.length > 40) console.log(`… ${parsed.rows.length - 40} more`);
  for (const s of parsed.skipped) console.log(`SKIP ${s.where}: ${s.reason}`);
}

show("apple-calendar.ics", parseIcs(read("apple-calendar.ics"), "apple", team));
show("google-calendar.ics", parseIcs(read("google-calendar.ics"), "google", team));
const table = readCsv(read("squire-export.csv"));
console.log("\nCSV mapping:", table.mapping, "needsMapping:", table.needsMapping);
show("squire-export.csv", csvRows(table, "squire", team));
