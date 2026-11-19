// One stroke-icon set for the friend's home: talk bar, chat sheet, fan menu and help sheet.
const ICONS = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></>,
  chat: <><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.4"/></>,
  send: <><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z"/><path d="m10 13 5-5"/></>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  wave: <><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-6.5V5a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4 14.5a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/><path d="M18.5 3.5c1 .6 1.7 1.6 2 2.8M3.5 6.5c.3-1.2 1-2.2 2-2.8"/></>,
  pet: <><path d="M4 15c2.5-4 5.5-6 8-6s5.5 2 8 6"/><path d="M7 18.5c1.5-2 3.2-3 5-3s3.5 1 5 3"/><path d="M12 3v3M8.5 4.5l1 2.2M15.5 4.5l-1 2.2"/></>,
  snack: <><circle cx="12" cy="12" r="8.5"/><path d="M9 9h.01M14.5 8.5h.01M15 14h.01M9.5 14.5h.01M12 11.5h.01" strokeWidth="2.4"/></>,
  hug: <path d="M12 19.5s-7-4.2-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 5-7 9.2-7 9.2Z"/>,
  play: <><circle cx="12" cy="12" r="8.5"/><path d="M4 9.5c5 1.6 11 1.6 16 0M5 17c4-2.4 10-2.4 14 0"/></>,
  breathe: <><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 17h7"/></>,
  sing: <><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></>,
  walk: <><path d="M8.5 4.5c1.7 0 2.5 1.5 2.5 3.5s-1 4-2.5 4S6 10 6 8s.8-3.5 2.5-3.5ZM7 14.5h3"/><path d="M15.5 10.5c1.7 0 2.5 1.5 2.5 3.5s-1 4-2.5 4S13 16 13 14s.8-3.5 2.5-3.5ZM14 20.5h3"/></>,
  dance: <><path d="m12 3 1.9 4.6L19 8l-3.8 3.3 1.2 5L12 13.7 7.6 16.3l1.2-5L5 8l5.1-.4L12 3Z"/><path d="M4 20c1.5-1 2.5-1 4 0s2.5 1 4 0 2.5-1 4 0 2.5 1 4 0"/></>,
  talk: <><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></>,
  dress: <path d="M9 3.5 4 6l1.5 4.5L7.5 10V20h9V10l2 .5L20 6l-5-2.5c-.5 1.4-1.6 2.2-3 2.2s-2.5-.8-3-2.2Z"/>,
  support: <><path d="M6 3.5h9l3 3V20.5H6z"/><path d="M15 3.5v3h3M9 11h6M9 14.5h6M9 18h3.5"/></>,
  help: <><path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.5L8 20v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="M10 9a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1v.3M12 14.2h.01"/></>,
  sparkle: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="M19 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z"/></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></>,
};
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}
