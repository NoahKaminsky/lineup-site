"use client";

import { ChevronDown } from "lucide-react";

// Short steps for getting a calendar out of each app. Kept plain: owners
// read this on their phone while their old app is open on a laptop.
const SOURCES: { name: string; file: string; steps: string[] }[] = [
  {
    name: "Apple Calendar",
    file: ".ics",
    steps: [
      "On a Mac, open Calendar.",
      "Click the calendar you want in the left sidebar.",
      "Choose File, then Export, then Export.",
      "Save the file and add it here. iPhones can't export, so use a Mac.",
    ],
  },
  {
    name: "Google Calendar",
    file: ".ics",
    steps: [
      "On a computer, open Google Calendar.",
      "Click the gear, then Settings, then Import & export.",
      "Click Export. A zip file downloads.",
      "Open the zip. Each calendar inside is an .ics file you can add here.",
    ],
  },
  {
    name: "Outlook",
    file: ".ics",
    steps: [
      "In Outlook on Windows, go to the calendar.",
      "Choose File, then Save Calendar.",
      "Under More options, pick Whole calendar and full details.",
      "Save it and add the .ics file here.",
    ],
  },
  {
    name: "Squire",
    file: ".csv",
    steps: [
      "Sign in to Squire's business dashboard on a computer.",
      "Open your appointments report and set the dates from today forward.",
      "Export it as a CSV file and add it here.",
      "Can't find it? Squire's support team can send you the export.",
    ],
  },
  {
    name: "Booksy",
    file: ".csv",
    steps: [
      "Sign in to Booksy Biz on a computer.",
      "Open the appointments or calendar report and choose your dates.",
      "Export it as CSV (or Excel saved as CSV) and add it here.",
    ],
  },
  {
    name: "Fresha",
    file: ".csv",
    steps: [
      "Sign in to Fresha for business on a computer.",
      "Go to Reports and open the appointments list.",
      "Set the dates, then Export as CSV and add it here.",
    ],
  },
  {
    name: "Square",
    file: ".csv",
    steps: [
      "Sign in to your Square Dashboard on a computer.",
      "Open Appointments and find the export or reports option.",
      "Download your upcoming appointments as CSV and add it here.",
    ],
  },
];

export default function ExportHelp() {
  return (
    <div className="divide-y divide-hairline rounded-2xl ring-1 ring-ink/[0.06]">
      {SOURCES.map((s) => (
        <details key={s.name} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
            <span>
              {s.name} <span className="font-normal text-neutral-400">{s.file}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-neutral-400 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 text-sm leading-6 text-neutral-600">
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
