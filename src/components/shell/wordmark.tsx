export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="translate-y-[2px]">
        {/* A measured rise: baseline, a rule and a tick, the drawing-set motif. */}
        <path d="M1 15.5h16" stroke="var(--ink-3)" strokeWidth="1" />
        <path d="M2.5 12.5 7 8.5l3 2.5 5.5-6" stroke="var(--ink)" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 2.5v4M13 5h4" stroke="var(--annot)" strokeWidth="1" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">EdgeLab</span>
    </span>
  );
}
