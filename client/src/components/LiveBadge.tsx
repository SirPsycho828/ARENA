export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-body font-bold uppercase tracking-wider bg-live text-white">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-live-pulse" />
      LIVE
    </span>
  );
}
