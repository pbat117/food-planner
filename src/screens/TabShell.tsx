'use client';

import { BookOpen, CalendarDays, ShoppingCart, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppStateProvider } from '@/state/AppState';
import { TabBar } from '@/ui/TabBar';

const TABS = [
  { href: '/week', label: 'This Trip', icon: CalendarDays },
  { href: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/profile', label: 'Profile', icon: User },
];

export function TabShell({ children }: { children: ReactNode }) {
  return (
    <AppStateProvider>
      <main className="mx-auto max-w-xl pb-[calc(49px+env(safe-area-inset-bottom)+24px)]">{children}</main>
      <TabBar items={TABS} />
    </AppStateProvider>
  );
}
