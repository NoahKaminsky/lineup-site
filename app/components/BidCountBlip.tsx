// Small "2 pros have bid on this already" nudge shown to pros who haven't
// sent an offer yet. Renders nothing until at least one other pro has bid.
export default function BidCountBlip({ count, className = "" }: { count: number | undefined; className?: string }) {
  if (!count || count < 1) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 ${className}`}
    >
      <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
      </span>
      {count === 1 ? "1 pro has bid on this already" : `${count} pros have bid on this already`}
    </span>
  );
}
