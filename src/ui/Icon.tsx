import type { ReactNode, SVGProps } from 'react';

/**
 * Every glyph in the studio is a real SVG path, never a font character.
 *
 * Unicode symbols looked fine in a browser but broke inside the app: SF Mono
 * has no ⌘ or ◧ (they rendered as tofu boxes), and a handful of others —
 * ⏮ ⚡ ✳ ❚❚ — carry *emoji presentation* by default, so macOS drew them as
 * coloured emoji in the middle of a neutral grey interface. Drawing the shapes
 * ourselves removes the font dependency entirely and lets every stroke match
 * the 1px hairline language of the rest of the design.
 */

export type IconName =
  // interface
  | 'search' | 'play' | 'pause' | 'restart' | 'code' | 'panel'
  | 'save' | 'image' | 'close' | 'duplicate' | 'dice' | 'plus'
  | 'trash' | 'check' | 'external' | 'chevron-down' | 'chevron-right'
  | 'warning' | 'copy' | 'slider' | 'command' | 'download'
  // rail sections
  | 'scenes' | 'pattern' | 'flow' | 'structure' | 'volume'
  | 'colour' | 'post' | 'nodes' | 'export'
  // archetypes
  | 'braid' | 'threads' | 'vortex' | 'lattice' | 'rift'
  | 'nebula' | 'storm' | 'shock' | 'crystal'
  // node behaviours
  | 'attract' | 'repel' | 'swirl' | 'sink' | 'shear'
  | 'burst' | 'ripple' | 'magnet' | 'source';

const PATHS: Record<IconName, ReactNode> = {
  /* ───────────────────────── interface ───────────────────────── */
  search: (
    <>
      <circle cx="7.1" cy="7.1" r="4.3" />
      <path d="m10.3 10.3 3.2 3.2" />
    </>
  ),
  play: <path d="M5.4 3.4 12.8 8l-7.4 4.6z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M5.5 3.6h2v8.8h-2z" fill="currentColor" stroke="none" />
      <path d="M8.5 3.6h2v8.8h-2z" fill="currentColor" stroke="none" />
    </>
  ),
  restart: (
    <>
      <path d="M13.2 8A5.2 5.2 0 1 1 8 2.8h3.4" />
      <path d="M9.3 1 11.6 2.8 9.3 4.6" />
    </>
  ),
  code: (
    <>
      <path d="m6.2 4.4-3.6 3.6 3.6 3.6" />
      <path d="m9.8 4.4 3.6 3.6-3.6 3.6" />
    </>
  ),
  panel: (
    <>
      <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6" />
      <path d="M9.8 3.2v9.6" />
    </>
  ),
  save: (
    <>
      <path d="M8 2.6v7.6" />
      <path d="m5.1 7.4 2.9 2.9 2.9-2.9" />
      <path d="M2.8 12.4v1.1h10.4v-1.1" />
    </>
  ),
  image: (
    <>
      <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6" />
      <circle cx="5.9" cy="6.4" r="1.1" />
      <path d="m2.6 11.4 3.2-3 2.6 2.3 2.2-2 3.2 3" />
    </>
  ),
  close: (
    <>
      <path d="m4.6 4.6 6.8 6.8" />
      <path d="m11.4 4.6-6.8 6.8" />
    </>
  ),
  duplicate: (
    <>
      <rect x="5.6" y="5.6" width="8.2" height="8.2" rx="1.4" />
      <path d="M10.4 5.6V3.6a1.4 1.4 0 0 0-1.4-1.4H3.6a1.4 1.4 0 0 0-1.4 1.4v5.4a1.4 1.4 0 0 0 1.4 1.4h2" />
    </>
  ),
  dice: (
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2" />
      <circle cx="5.8" cy="5.8" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="10.2" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  plus: (
    <>
      <path d="M8 3.2v9.6" />
      <path d="M3.2 8h9.6" />
    </>
  ),
  trash: (
    <>
      <path d="M3.2 4.4h9.6" />
      <path d="M6.4 4.4V3a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.4" />
      <path d="M4.6 4.4 5.3 13a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.7-8.6" />
    </>
  ),
  check: <path d="m3.4 8.4 3.1 3.1 6.1-7" />,
  external: (
    <>
      <path d="M8.6 3.2h4.2v4.2" />
      <path d="M12.8 3.2 7.4 8.6" />
      <path d="M11.2 9.6v2.6a1.4 1.4 0 0 1-1.4 1.4H3.8a1.4 1.4 0 0 1-1.4-1.4V6.2a1.4 1.4 0 0 1 1.4-1.4h2.6" />
    </>
  ),
  'chevron-down': <path d="m4.2 6.2 3.8 3.8 3.8-3.8" />,
  'chevron-right': <path d="m6.2 4.2 3.8 3.8-3.8 3.8" />,
  warning: (
    <>
      <path d="M8 2.4 14.2 13H1.8z" />
      <path d="M8 6.4v3.2" />
      <circle cx="8" cy="11.4" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  copy: (
    <>
      <rect x="5.6" y="5.6" width="8.2" height="8.2" rx="1.4" />
      <path d="M10.4 5.6V3.6a1.4 1.4 0 0 0-1.4-1.4H3.6a1.4 1.4 0 0 0-1.4 1.4v5.4a1.4 1.4 0 0 0 1.4 1.4h2" />
    </>
  ),
  slider: (
    <>
      <path d="M2.4 5.4h11.2" />
      <path d="M2.4 10.6h11.2" />
      <circle cx="6.2" cy="5.4" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="10.6" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  /** the macOS command key — a font cannot be relied on to have U+2318 */
  command: (
    <>
      <path d="M6 6h4v4H6z" />
      <path d="M6 6V4.7A1.3 1.3 0 1 0 4.7 6z" />
      <path d="M10 6V4.7A1.3 1.3 0 1 1 11.3 6z" />
      <path d="M6 10v1.3A1.3 1.3 0 1 1 4.7 10z" />
      <path d="M10 10v1.3A1.3 1.3 0 1 0 11.3 10z" />
    </>
  ),
  download: (
    <>
      <path d="M8 2.4v7.2" />
      <path d="m5.1 7 2.9 2.9L10.9 7" />
      <path d="M2.8 12.2v1.2a1.1 1.1 0 0 0 1.1 1.1h8.2a1.1 1.1 0 0 0 1.1-1.1v-1.2" />
    </>
  ),

  /* ──────────────────────── rail sections ──────────────────────── */
  scenes: (
    <>
      <rect x="2.4" y="2.4" width="4.8" height="4.8" rx="1.1" />
      <rect x="8.8" y="2.4" width="4.8" height="4.8" rx="1.1" />
      <rect x="2.4" y="8.8" width="4.8" height="4.8" rx="1.1" />
      <rect x="8.8" y="8.8" width="4.8" height="4.8" rx="1.1" />
    </>
  ),
  pattern: (
    <>
      <path d="M8 2.2v11.6" />
      <path d="M2.98 5.1 13.02 10.9" />
      <path d="M13.02 5.1 2.98 10.9" />
    </>
  ),
  flow: (
    <path d="M1.7 9.4c1.15 0 1.15-4.4 2.3-4.4s1.15 4.4 2.3 4.4 1.15-4.4 2.3-4.4 1.15 4.4 2.3 4.4 1.15-4.4 2.3-4.4" />
  ),
  structure: (
    <>
      <path d="M5.6 2.4v11.2" />
      <path d="M10.4 2.4v11.2" />
      <path d="M2.4 5.6h11.2" />
      <path d="M2.4 10.4h11.2" />
    </>
  ),
  volume: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),
  colour: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  post: (
    <>
      <path d="M8 1.8 9.6 6.4 14.2 8 9.6 9.6 8 14.2 6.4 9.6 1.8 8 6.4 6.4z" />
    </>
  ),
  nodes: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  export: (
    <>
      <path d="M8 2.4v8.2" />
      <path d="m4.9 7.5 3.1 3.1 3.1-3.1" />
      <path d="M2.6 12.6v.9a1.1 1.1 0 0 0 1.1 1.1h8.6a1.1 1.1 0 0 0 1.1-1.1v-.9" />
    </>
  ),

  /* ───────────────────────── archetypes ───────────────────────── */
  braid: (
    <>
      <path d="M4 2.2c0 3.9 8 5.7 8 11.6" />
      <path d="M12 2.2c0 3.9-8 5.7-8 11.6" />
    </>
  ),
  threads: (
    <>
      <path d="M3.4 2.4v11.2" />
      <path d="M8 2.4v11.2" />
      <path d="M12.6 2.4v11.2" />
    </>
  ),
  vortex: (
    <>
      <path d="M8 2.6a5.4 5.4 0 1 1-5.4 5.4" />
      <path d="M8 5.2a2.8 2.8 0 1 0 2.8 2.8" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  lattice: (
    <>
      <path d="M2.6 5.6 13.4 10.4" />
      <path d="M2.6 10.4 13.4 5.6" />
      <path d="M8 2.4v11.2" />
    </>
  ),
  rift: (
    <>
      <path d="m8 1.8 1.6 3.4-2.2 3 1.8 3.1-1.2 3" />
      <path d="M3.4 4.4 6.4 7l-2.6 2.8" />
      <path d="m12.6 4.4-3 2.6 2.6 2.8" />
    </>
  ),
  nebula: (
    <>
      <path d="M4.6 11.6a3 3 0 0 1-.5-5.95 4.1 4.1 0 0 1 7.9-.9 2.8 2.8 0 0 1-.6 6.85z" />
      <circle cx="6.3" cy="7.4" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  storm: <path d="M9.2 1.6 3.4 9.4h3.5l-1 5 6.7-8.3H9.1z" />,
  shock: (
    <>
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4.9 4.9a4.4 4.4 0 0 0 0 6.2" />
      <path d="M11.1 4.9a4.4 4.4 0 0 1 0 6.2" />
      <path d="M2.6 2.6a7.6 7.6 0 0 0 0 10.8" />
      <path d="M13.4 2.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  crystal: (
    <>
      <path d="M8 1.7 13.6 5.9 11.5 12.7H4.5L2.4 5.9z" />
      <path d="M2.4 5.9h11.2" />
      <path d="M8 1.7 5.6 5.9 8 12.7l2.4-6.8z" />
    </>
  ),

  /* ─────────────────────── node behaviours ─────────────────────── */
  attract: (
    <>
      <path d="M1.9 8h6.2" />
      <path d="m5.6 5.5 2.5 2.5-2.5 2.5" />
      <path d="M14.1 8h-3" />
    </>
  ),
  repel: (
    <>
      <path d="M2.9 8h5.2" />
      <path d="m5.5 5.6 2.4 2.4-2.4 2.4" />
      <path d="M11.6 8h2.5" />
      <path d="m11.9 5.9 2.1 2.1-2.1 2.1" />
    </>
  ),
  swirl: (
    <>
      <path d="M8 2.6a5.4 5.4 0 1 1-5.4 5.4" />
      <path d="M8 5.6a2.4 2.4 0 1 0 2.4 2.4" />
      <path d="M8 8h2.4" />
    </>
  ),
  sink: (
    <>
      <path d="M8 1.8v7.4" />
      <path d="m5.2 6.6 2.8 2.8 2.8-2.8" />
      <path d="M3.2 13.4h9.6" />
    </>
  ),
  shear: (
    <>
      <path d="M2.4 5.4h7.4" />
      <path d="m7.4 3.2 2.4 2.2-2.4 2.2" />
      <path d="M6.2 10.6h7.4" />
      <path d="m11.2 8.4 2.4 2.2-2.4 2.2" />
    </>
  ),
  burst: (
    <>
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 1.6v2.6M8 11.8v2.6M1.6 8h2.6M11.8 8h2.6" />
      <path d="m3.5 3.5 1.9 1.9M10.6 10.6l1.9 1.9M12.5 3.5l-1.9 1.9M5.4 10.6l-1.9 1.9" />
    </>
  ),
  ripple: (
    <>
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="3.4" />
      <circle cx="8" cy="8" r="5.6" />
    </>
  ),
  magnet: (
    <>
      <path d="M4.2 12.4V7.6a3.8 3.8 0 0 1 7.6 0v4.8" />
      <path d="M4.2 12.4h2.6V7.8" />
      <path d="M11.8 12.4H9.2V7.8" />
    </>
  ),
  source: (
    <>
      <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
      <path d="M8 1.8v2.4M8 11.8v2.4M1.8 8h2.4M11.8 8h2.4" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
