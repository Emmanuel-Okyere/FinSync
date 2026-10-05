// Stroke icons from the FinSync design canvas (24px grid, 1.8 stroke).
const P: Record<string, string> = {
  budget: "M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  heart: "M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z",
  umbrella: "M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  plus: "M12 5v14M5 12h14",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  back: "M15 6l-6 6 6 6",
  next: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  arrowDownLeft: "M17 7 7 17M7 9v8h8",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  bank: "M3 10 12 4l9 6M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  trendUp: "M3 17l6-6 4 4 8-8M15 7h6v6",
  cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6M9 20h.01M17 20h.01",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  wallet: "M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2zM16 14h.01",
  ticket: "M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3zM14 6v12",
  briefcase: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
  reports: "M4 20v-3M9 20v-7M14 20V9M19 20V4",
  house: "M4 21V10l8-6 8 6v11zM9 21v-6h6v6",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  laptop: "M4 5h16v11H4zM2 19h20",
  message: "M4 5h16v11H9l-5 4z",
  play: "M4 5h16v14H4zM10 9l5 3-5 3z",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  car: "M5 17h14M4 17v-4l2-5h12l2 5v4M7 17v2M17 17v2M7.5 13h.01M16.5 13h.01",
  insights: "M5 20V11M11 20V5M17 20v-6M3 20h18",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  bus: "M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11M6 11h12M6 17h12M8 20v-3M16 20v-3",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  fileText: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  close: "M6 6l12 12M18 6 6 18",
  dumbbell: "M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 20M8.1 16.1 20 4",
  utensils: "M7 3v18M4 3v5a3 3 0 0 0 6 0V3M17 21V3c2 0 3.5 2.5 3.5 6s-1.5 5-3.5 5",
  transactions: "M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4",
  fingerprint: "M8 11a4 4 0 0 1 8 0v3M12 11v6M5 9a7 7 0 0 1 14 0v4M9 15v4M15 17v3",
  phone: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  shirt: "M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3",
  gift: "M4 10h16v11H4zM2 7h20v3H2zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4M12 7s1.5-4 4-4a2 2 0 0 1 0 4",
  tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  calculator: "M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h.01M12 18h3",
};

export const ICON_NAMES = Object.keys(P);

export function Icon({ name, label, className }: { name: string; label?: string; className?: string }) {
  const d = P[name] ?? P.tag;
  return (
    <span className={`ic${className ? ` ${className}` : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

export function GoogleIcon() {
  return (
    <span className="ic" aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path fill="#4285F4" d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z" />
        <path fill="#34A853" d="M12 21a8.9 8.9 0 0 0 6.1-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.7v2.4A9 9 0 0 0 12 21z" />
        <path fill="#FBBC05" d="M6.8 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.7a9 9 0 0 0 0 8.1z" />
        <path fill="#EA4335" d="M12 6.6a4.9 4.9 0 0 1 3.5 1.4l2.6-2.6A8.8 8.8 0 0 0 3.7 7.8l3.1 2.4A5.4 5.4 0 0 1 12 6.6z" />
      </svg>
    </span>
  );
}
