import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17v.01" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  compare: <><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></>,
  tree: <><circle cx="12" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="19" r="2.2" /><path d="M12 7.2v4.3M12 11.5H6v5.3M12 11.5h6v5.3" /></>,
  pulse: <><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></>,
  flow: <><rect x="3" y="3.5" width="7" height="5" rx="1.2" /><rect x="14" y="15.5" width="7" height="5" rx="1.2" /><path d="M6.5 8.5v4.5a2 2 0 0 0 2 2H14" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" /></>,
  puzzle: <><path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4V4Z" /></>,
  checklist: <><path d="m4 7 1.8 1.8L9 5.5M4 16l1.8 1.8L9 14.5M12 7h8M12 16h8" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  sort: <><path d="M4 6h16M4 12h10M4 18h5" /></>,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" /><path d="M7.5 14h9" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></>,
  book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 5a3.2 3.2 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></>,
  flaskx: <><path d="M9 3h6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  dot: <><circle cx="12" cy="12" r="3" /></>,
  down: <><path d="m6 9 6 6 6-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {P[name] ?? P.dot}
    </svg>
  );
}
