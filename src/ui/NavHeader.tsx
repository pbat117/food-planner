'use client';

import { type ReactNode, useEffect, useState } from 'react';

/** Large title that collapses into a small centred title on scroll, like a UINavigationBar. */
export function NavHeader({ title, trailing, leading }: { title: string; trailing?: ReactNode; leading?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 36);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
      <div
        className={`sticky top-0 z-30 grid min-h-11 grid-cols-[1fr_auto_1fr] items-center px-4 pt-[env(safe-area-inset-top)] transition-colors ${
          collapsed ? 'border-b border-separator/70 bg-[var(--bar)] backdrop-blur-xl backdrop-saturate-150' : 'border-b border-transparent'
        }`}
      >
        <span className="justify-self-start">{leading}</span>
        <span className={`text-headline font-semibold transition-opacity ${collapsed ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!collapsed}>
          {title}
        </span>
        <span className="justify-self-end">{trailing}</span>
      </div>
      <h1 className="px-4 pt-0.5 pb-2 text-large-title font-bold tracking-[0.01em]">{title}</h1>
    </>
  );
}
