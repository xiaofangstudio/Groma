import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function IconCursor(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.2 2.4 12.9 8.1l-4.2.6-2.1 4.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHand(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.2 7.3V4.1a1 1 0 0 1 2 0v3M7.2 6.6V3.1a1 1 0 0 1 2 0v3.6M9.2 6.9V4.2a1 1 0 0 1 2 0v4.2M5.2 7V6a1 1 0 0 0-2 0v3.2c0 2.6 1.7 4.3 4.2 4.3h1.2c2.3 0 3.8-1.6 3.8-3.9V6.3" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6.5h7a3.2 3.2 0 0 1 0 6.4H6.5M6 3.5 3 6.5l3 3" />
    </svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 6.5H6a3.2 3.2 0 0 0 0 6.4h3.5M10 3.5l3 3-3 3" />
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" />
      <path d="M3 2.9v2.4h2.4M8 5.2v3l2.1 1.3" />
    </svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8h10" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="3" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4Z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 4.4C2 5.2 1.8 8 1.8 8s2.2 4 6.2 4c1.3 0 2.4-.4 3.3-.9M6.6 4.3c.4-.2.9-.3 1.4-.3 4 0 6.2 4 6.2 4s-.8 1.5-2.1 2.5M2.5 2.5l11 11" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}

export function IconUnlock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.7-1.1" />
    </svg>
  );
}

export function IconFrame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 2v12M11.5 2v12M2 4.5h12M2 11.5h12" />
    </svg>
  );
}

export function IconSection(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.4" y="4.2" width="11.2" height="9.4" rx="1" strokeDasharray="3 2" />
      <path d="M3.4 2.4h4.2" />
    </svg>
  );
}

export function IconRect(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
    </svg>
  );
}

export function IconEllipse(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="5.6" />
    </svg>
  );
}

export function IconLine(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13L13 3" />
    </svg>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13L13 3M13 3H8.6M13 3V7.4" />
    </svg>
  );
}

export function IconPolygon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.2L13.6 5.4L12.2 11.9L3.8 11.9L2.4 5.4Z" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.1L9.7 6.1L14 6.5L10.8 9.4L11.8 13.7L8 11.5L4.2 13.7L5.2 9.4L2 6.5L6.3 6.1Z" />
    </svg>
  );
}

export function IconSlice(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1" strokeDasharray="3 2" />
      <path d="M5.2 10.8 10.8 5.2" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
      <circle cx="5.6" cy="6.4" r="1.1" />
      <path d="M3.2 11.2l3.1-3 2.3 2.2 1.8-1.7 2.4 2.5" />
    </svg>
  );
}

export function IconPath(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 11.5c2.2-6.4 4.2 2.2 6.2-2.6 1.4-3.4 3.2 3.4 4.8 1.4" />
      <circle cx="2.7" cy="11.5" r="1.1" />
      <circle cx="13.5" cy="10.3" r="1.1" />
    </svg>
  );
}

export function IconPen(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 13.2 4.2 8.5 10.5 2.2 13.8 5.5 7.5 11.8Z" />
      <path d="M4.2 8.5 7.5 11.8" />
    </svg>
  );
}

export function IconText(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3.2h10M8 3.2v9.6M5.8 12.8h4.4" />
    </svg>
  );
}

export function IconPage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="2.5" width="10" height="11" rx="1.4" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 3.5 5 8l4.5 4.5" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 3.5 11 8l-4.5 4.5" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3 3" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 3H3v10h10v-3.5M9.5 3h3.5v3.5M13 3 7.5 8.5" />
    </svg>
  );
}

export function IconImport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3v7.5M5.4 7.7 8 10.3l2.6-2.6M3 12.2v1.3h10v-1.3" />
    </svg>
  );
}

export function IconExport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.5v7.5M5.4 7.7 8 10.3l2.6-2.6M3 12.2v1.3h10v-1.3" />
    </svg>
  );
}

export function IconGroup(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      <rect x="6.5" y="6.5" width="7" height="7" rx="1" />
    </svg>
  );
}

export function IconUngroup(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

export function IconAlignLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 2.5v11" />
      <rect x="4.6" y="4" width="7" height="2.6" rx="0.5" />
      <rect x="4.6" y="9.4" width="10" height="2.6" rx="0.5" />
    </svg>
  );
}

export function IconAlignHCenter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.5v11" />
      <rect x="5" y="4" width="6" height="2.6" rx="0.5" />
      <rect x="3" y="9.4" width="10" height="2.6" rx="0.5" />
    </svg>
  );
}

export function IconAlignRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.2 2.5v11" />
      <rect x="4.4" y="4" width="7" height="2.6" rx="0.5" />
      <rect x="1.4" y="9.4" width="10" height="2.6" rx="0.5" />
    </svg>
  );
}

export function IconAlignTop(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 2.8h11" />
      <rect x="4" y="4.6" width="2.6" height="7" rx="0.5" />
      <rect x="9.4" y="4.6" width="2.6" height="10" rx="0.5" />
    </svg>
  );
}

export function IconAlignVCenter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 8h11" />
      <rect x="4" y="5" width="2.6" height="6" rx="0.5" />
      <rect x="9.4" y="3" width="2.6" height="10" rx="0.5" />
    </svg>
  );
}

export function IconAlignBottom(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 13.2h11" />
      <rect x="4" y="4.4" width="2.6" height="7" rx="0.5" />
      <rect x="9.4" y="1.4" width="2.6" height="10" rx="0.5" />
    </svg>
  );
}

export function IconDistributeH(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="2.6" height="8" rx="0.5" />
      <rect x="6.7" y="4" width="2.6" height="8" rx="0.5" />
      <rect x="11.4" y="4" width="2.6" height="8" rx="0.5" />
    </svg>
  );
}

export function IconDistributeV(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="2" width="8" height="2.6" rx="0.5" />
      <rect x="4" y="6.7" width="8" height="2.6" rx="0.5" />
      <rect x="4" y="11.4" width="8" height="2.6" rx="0.5" />
    </svg>
  );
}

