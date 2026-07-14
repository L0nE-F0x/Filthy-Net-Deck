import type { ReactNode } from "react";

type IconProps = { className?: string };

export function IconDaily({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v4M16 4v4" />
      <path d="M8 14h3M13 14h3M8 17h8" />
    </svg>
  );
}

export function IconMeta({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3-4 3 2 5-7" />
      <circle cx="19" cy="6" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function IconBack({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 012-2h10" />
    </svg>
  );
}

export function IconStar({ className, filled }: IconProps & { filled?: boolean }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

export function IconStats({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 4h8v5.5a4 4 0 01-8 0V4z" />
      <path d="M8 5.5H5.5a2.5 2.5 0 002.6 3.4M16 5.5h2.5a2.5 2.5 0 01-2.6 3.4" />
      <path d="M12 13.5V16M9.5 19h5M10.5 16h3" />
    </svg>
  );
}

export function IconQueue({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M5 6h14M5 12h14M5 18h10" />
    </svg>
  );
}

export function IconMatchups({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M4.5 18c.6-2.2 2.3-3.5 3.5-3.5S10.9 15.8 11.5 18" />
      <path d="M12.5 18c.6-2.2 2.3-3.5 3.5-3.5s2.9 1.3 3.5 3.5" />
      <path d="M11 11.5l2 0" />
    </svg>
  );
}

export function IconClimb({ className }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 18l5-6 4 3 7-9" />
      <path d="M15 6h5v5" />
    </svg>
  );
}
