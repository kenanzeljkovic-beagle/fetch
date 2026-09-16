// Minimal inline icon set — avoids adding a dependency for a handful of glyphs.
import type { SVGProps } from 'react';

type IconProps = { size?: number } & SVGProps<SVGSVGElement>;
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function Phone({ size = 16, ...p }: IconProps) {
  return <svg {...base(size)} {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
export function PhoneOff({ size = 16, ...p }: IconProps) {
  return <svg {...base(size)} {...p}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.86.31 1.8.55 2.81.7a2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}
export function Check({ size = 16, ...p }: IconProps) {
  return <svg {...base(size)} {...p}><polyline points="20 6 9 17 4 12"/></svg>;
}
export function ChevronDown({ size = 16, ...p }: IconProps) {
  return <svg {...base(size)} {...p}><polyline points="6 9 12 15 18 9"/></svg>;
}
export function Delete({ size = 16, ...p }: IconProps) {
  return <svg {...base(size)} {...p}><path d="M9 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6-6z"/><line x1="14" y1="10" x2="10" y2="14"/><line x1="10" y1="10" x2="14" y2="14"/></svg>;
}
