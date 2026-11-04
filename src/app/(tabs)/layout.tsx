import { TabShell } from '@/screens/TabShell';

export default function TabsLayout({ children }: LayoutProps<'/'>) {
  return <TabShell>{children}</TabShell>;
}
