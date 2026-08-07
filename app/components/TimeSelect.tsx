"use client";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

function buildMinuteOptions(step: number) {
  const options: string[] = [];
  for (let minute = 0; minute < 60; minute += step) {
    options.push(String(minute).padStart(2, "0"));
  }
  return options;
}

function parseValue(value: string) {
  if (!value) return null;
  const [hourString, minuteString = "00"] = value.split(":");
  const hour24 = Number(hourString);
  if (Number.isNaN(hour24)) return null;
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return { hour12, minute: minuteString.slice(0, 2), period };
}

function to24HourValue(hour12: number, minute: string, period: "AM" | "PM") {
  const hour24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

// Native `<input type="time">` ignores the `step` attribute for its scroll-wheel
// UI on iOS Safari — the wheel always scrolls by 1 minute regardless. Using
// plain selects instead guarantees the picker only ever offers stepped minutes.
export default function TimeSelect({
  value,
  onChange,
  step = 10,
  selectClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  selectClassName: string;
}) {
  const parsed = parseValue(value);
  const minuteOptions = buildMinuteOptions(step);

  function emit(hour12: number, minute: string, period: "AM" | "PM") {
    onChange(to24HourValue(hour12, minute, period));
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      <select
        value={parsed?.hour12 ?? ""}
        onChange={(e) =>
          emit(Number(e.target.value), parsed?.minute ?? minuteOptions[0], parsed?.period ?? "AM")
        }
        className={selectClassName}
      >
        <option value="" disabled>
          Hour
        </option>
        {HOURS_12.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>

      <select
        value={parsed?.minute ?? ""}
        onChange={(e) => emit(parsed?.hour12 ?? 12, e.target.value, parsed?.period ?? "AM")}
        className={selectClassName}
      >
        <option value="" disabled>
          Min
        </option>
        {minuteOptions.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>

      <select
        value={parsed?.period ?? ""}
        onChange={(e) =>
          emit(parsed?.hour12 ?? 12, parsed?.minute ?? minuteOptions[0], e.target.value as "AM" | "PM")
        }
        className={selectClassName}
      >
        <option value="" disabled>
          —
        </option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
