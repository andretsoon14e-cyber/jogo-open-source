import type { SVGProps } from "react";

export type IconName =
  | "pause" | "map" | "quest" | "build" | "settings" | "sword" | "bag" | "food"
  | "dash" | "hand" | "run" | "close" | "check" | "rotate" | "play" | "home" | "trophy" | "users" | "help";

const P: Record<IconName, React.ReactNode> = {
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
  play: <path d="M7 4v16l13-8z" />,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" /></>,
  quest: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="1.5" /></>,
  build: <><path d="M14 3l7 7-3 3-7-7z" /><path d="M11 10l-8 8 3 3 8-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></>,
  settings: <><path d="M12 8a4 4 0 100 8 4 4 0 000-8z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  sword: <><path d="M4 20l3-3M7 17l10-10 3-3-1 4-10 10z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="M5 14l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="2" /></>,
  food: <><path d="M6 3c4 0 7 3 7 7 0 2-1 3-2 4l6 6-2 2-6-6c-1 1-2 2-4 2-4 0-7-3-7-7 1 3 4 4 6 2s1-5-2-6c2-2 4-4 4-4z" transform="translate(2 0)" /></>,
  dash: <><path d="M13 4l-7 9h5l-2 7 8-10h-5z" /></>,
  hand: <><path d="M8 11V5a1.5 1.5 0 013 0v6M11 10V4a1.5 1.5 0 013 0v7M14 11V6a1.5 1.5 0 013 0v8c0 4-2 7-6 7s-5-2-7-6c-1-2 1-3 2-2l2 2V9a1.5 1.5 0 013 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  run: <><circle cx="14" cy="4" r="2" /><path d="M13 8l-4 3 2 4-4 5M13 8l3 3 3-1M13 8l-1 6 3 3 1 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  check: <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  rotate: <><path d="M5 8a8 8 0 0113-2l2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M20 3v5h-5M19 16a8 8 0 01-13 2l-2-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 21v-5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></>,
  home: <path d="M4 11l8-7 8 7v9h-5v-5h-6v5H4z" />,
  trophy: <><path d="M7 4h10v4a5 5 0 01-10 0z" /><path d="M7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 13h4v3h3v3H7v-3h3z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2 20a7 7 0 0114 0zM15 20a5 5 0 017-4v4z" /></>,
  help: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.2" /></>,
};

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      {P[name]}
    </svg>
  );
}
