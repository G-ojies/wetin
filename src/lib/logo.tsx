// Wetin mark: a question bubble with a check, for "ask" and "every quote verified".
// Colours follow the theme tokens so it reads in light and dark mode.
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <rect width="512" height="512" rx="112" fill="var(--green)" />
      <path d="M164 112h184a64 64 0 0 1 64 64v120a64 64 0 0 1-64 64H250l-92 64 18-64h-12a64 64 0 0 1-64-64V176a64 64 0 0 1 64-64z" fill="var(--bg)" />
      <path d="M186 236l50 50 92-94" fill="none" stroke="var(--green)" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
