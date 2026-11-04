'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** iOS tab bar, translucent, pinned to the bottom. */
export function TabBar({ items }: { items: TabItem[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-separator/70 bg-[var(--bar)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="mx-auto flex max-w-xl">
        {items.map(({ href, label, icon: Icon }) => {
          const on = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-[49px] flex-col items-center justify-center gap-0.5 pt-1 text-[10px] font-medium ${on ? 'text-tint' : 'text-secondary'}`}
              >
                <Icon aria-hidden className="size-6" strokeWidth={on ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
