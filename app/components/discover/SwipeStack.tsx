"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export type SwipeCardData = {
  key: string;
  href: string;
  image: string | null;
  name: string;
  primaryRole: string;
  badges: { label: string; className: string }[];
  rating: string | null;
  distanceLabel: string | null;
};

const SWIPE_THRESHOLD = 90;
const EXIT_DURATION = 220;

export default function SwipeStack({ cards }: { cards: SwipeCardData[] }) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  const visibleCards = cards.slice(index, index + 3);

  function advance(direction: "left" | "right") {
    if (exitDirection) return;
    setDragging(false);
    setExitDirection(direction);
    setTimeout(() => {
      setIndex((prev) => prev + 1);
      setDragX(0);
      setExitDirection(null);
    }, EXIT_DURATION);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (exitDirection) return;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || pointerIdRef.current !== e.pointerId) return;
    setDragX(e.clientX - startXRef.current);
  }

  function finishDrag() {
    if (!dragging) return;
    pointerIdRef.current = null;

    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      advance(dragX > 0 ? "right" : "left");
    } else {
      setDragging(false);
      setDragX(0);
    }
  }

  if (index >= cards.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-900">You&apos;ve seen everyone</p>
        <p className="mt-1 text-sm text-neutral-500">Check back later, or start over to browse again.</p>
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="mt-4 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mx-auto h-[26rem] w-full max-w-sm">
        {visibleCards
          .map((card, i) => ({ card, i }))
          .reverse()
          .map(({ card, i }) => {
            const isTop = i === 0;
            const stackOffset = i * 22;
            const stackScale = 1 - i * 0.07;

            const translateX = isTop ? dragX : 0;
            const rotate = isTop ? dragX / 18 : 0;

            let transform = `translateX(${translateX}px) translateY(${stackOffset}px) rotate(${rotate}deg) scale(${stackScale})`;
            let opacity = isTop ? 1 : 1 - i * 0.15;
            const transition = dragging && isTop ? "none" : "transform 260ms ease, opacity 260ms ease";

            if (isTop && exitDirection) {
              const flyX = exitDirection === "right" ? 520 : -520;
              const flyRotate = exitDirection === "right" ? 24 : -24;
              transform = `translateX(${flyX}px) translateY(${stackOffset}px) rotate(${flyRotate}deg) scale(${stackScale})`;
              opacity = 0;
            }

            return (
              <Link
                key={card.key}
                href={card.href}
                onClick={(e) => {
                  if (isTop && Math.abs(dragX) > 8) e.preventDefault();
                }}
                onPointerDown={isTop ? handlePointerDown : undefined}
                onPointerMove={isTop ? handlePointerMove : undefined}
                onPointerUp={isTop ? finishDrag : undefined}
                onPointerCancel={isTop ? finishDrag : undefined}
                style={{ transform, opacity, transition, zIndex: 10 - i, touchAction: "pan-y" }}
                className="absolute inset-0 flex select-none flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-lg"
              >
                <div className="relative h-full w-full overflow-hidden bg-neutral-100">
                  {card.image ? (
                    <img
                      src={card.image}
                      alt={card.name}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-neutral-50 to-neutral-100">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-neutral-200 bg-white text-3xl font-semibold text-neutral-400">
                        {card.name.charAt(0).toUpperCase() || "P"}
                      </div>
                    </div>
                  )}

                  {card.badges.length > 0 ? (
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                      {card.badges.map((badge) => (
                        <span
                          key={badge.label}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {card.rating ? (
                    <span className="absolute right-3 top-3 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-neutral-900 shadow-sm">
                      ★ {card.rating}
                    </span>
                  ) : null}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 pt-12">
                    <p className="text-lg font-semibold text-white">{card.name}</p>
                    <p className="text-sm text-white/80">
                      {card.primaryRole}
                      {card.distanceLabel ? ` · ${card.distanceLabel}` : ""}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {cards.slice(0, Math.min(cards.length, 12)).map((card, i) => (
          <span
            key={card.key}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-neutral-900" : "w-1.5 bg-neutral-200"
            }`}
          />
        ))}
      </div>

      <p className="mt-2 text-center text-xs text-neutral-400">Swipe to browse</p>
    </div>
  );
}
