// The FinSync mark from the design: two linked rings with a rising gold arrow.
export function LogoMark({ size = 46, onHero = false }: { size?: number; onHero?: boolean }) {
  const ring = onHero ? "var(--on-hero)" : "var(--brand)";
  const cut = onHero ? "var(--hero)" : "var(--surface)";
  return (
    <svg width={size} height={(size * 170) / 240} viewBox="0 0 240 170" role="img" aria-label="FinSync">
      <circle cx="84" cy="96" r="50" fill="none" stroke={ring} strokeWidth="22" />
      <circle cx="152" cy="96" r="50" fill="none" stroke="var(--accent)" strokeWidth="22" />
      <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke={cut} strokeWidth="32" />
      <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke={ring} strokeWidth="22" />
      <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke={cut} strokeWidth="32" />
      <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke="var(--accent)" strokeWidth="22" />
      <polyline points="24,152 82,98 110,122 192,40" fill="none" stroke={cut} strokeWidth="27" strokeLinejoin="miter" />
      <polygon points="222,10 172,24 208,60" fill={cut} stroke={cut} strokeWidth="8" strokeLinejoin="round" />
      <polyline points="24,152 82,98 110,122 192,40" fill="none" stroke="var(--accent)" strokeWidth="15" strokeLinejoin="miter" />
      <polygon points="222,10 172,24 208,60" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ onHero = false }: { onHero?: boolean }) {
  return (
    <span className="sk-wordmark" style={{ color: onHero ? "var(--on-hero)" : "var(--ink)" }}>
      <LogoMark onHero={onHero} />
      <span>
        <span style={{ color: onHero ? "var(--on-hero)" : "var(--brand)" }}>Fin</span>
        <span style={{ color: onHero ? "var(--accent)" : "var(--ink)" }}>Sync</span>
      </span>
    </span>
  );
}

export function HeroRings() {
  return (
    <svg style={{ position: "absolute", right: -120, top: 70, opacity: 0.95, pointerEvents: "none" }} width="420" height="298" viewBox="0 0 240 170" aria-hidden>
      <circle cx="84" cy="96" r="50" fill="none" stroke="var(--on-hero-muted)" strokeWidth="22" />
      <circle cx="152" cy="96" r="50" fill="none" stroke="var(--accent)" strokeWidth="22" />
      <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke="var(--hero)" strokeWidth="32" />
      <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke="var(--on-hero-muted)" strokeWidth="22" />
      <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke="var(--hero)" strokeWidth="32" />
      <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke="var(--accent)" strokeWidth="22" />
    </svg>
  );
}
