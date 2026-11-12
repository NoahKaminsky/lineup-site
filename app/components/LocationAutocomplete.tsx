"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  placeId: string;
  text: string;
};

export type SelectedLocation = {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  name?: string | null;
};

type Props = {
  label?: string;
  placeholder?: string;
  value?: string;
  onSelect: (location: SelectedLocation) => void;
  // Called when the person edits the text by hand (any earlier pick is stale).
  onInputChange?: (value: string) => void;
};

export default function LocationAutocomplete({
  label = "Location",
  placeholder = "Start typing an address...",
  value = "",
  onSelect,
  onInputChange,
}: Props) {
  const [input, setInput] = useState(value);
  // Set when we fill the box ourselves (a picked suggestion, or a saved
  // address on load), so that doesn't start a search and pop the list open.
  const skipSearchRef = useRef(!!value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (!input || input.length < 2) {
        setSuggestions([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });

        const data = await res.json();
        if (!cancelled) setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [input]);

  async function handleSelect(suggestion: Suggestion) {
    skipSearchRef.current = true;
    setInput(suggestion.text);
    setSuggestions([]);

    const res = await fetch("/api/places/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: suggestion.placeId }),
    });

    const data = await res.json();

    onSelect({
      placeId: data.placeId,
      formattedAddress: data.formattedAddress,
      lat: data.lat,
      lng: data.lng,
      name: data.name,
    });
  }

  return (
    <div className="relative w-full">
      <label className="mb-2 block text-sm font-semibold text-neutral-900">
        {label}
      </label>

      <input
        autoComplete="off"
        value={input}
        onChange={(e) => {
          skipSearchRef.current = false;
          setInput(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-ink"
      />

      {loading && (
        <p className="mt-2 text-xs text-neutral-500">Searching...</p>
      )}

      {suggestions.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="block w-full px-4 py-3 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              {suggestion.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}