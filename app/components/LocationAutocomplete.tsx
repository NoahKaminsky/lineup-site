"use client";

import { useEffect, useState } from "react";

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
};

export default function LocationAutocomplete({
  label = "Location",
  placeholder = "Start typing an address...",
  value = "",
  onSelect,
}: Props) {
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [input]);

  async function handleSelect(suggestion: Suggestion) {
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
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-black"
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