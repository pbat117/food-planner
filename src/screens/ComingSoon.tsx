import { NavHeader } from '@/ui/NavHeader';

export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <>
      <NavHeader title={title} />
      <p className="mx-4 mt-6 rounded-[10px] bg-cell px-4 py-6 text-center text-body text-secondary">{text}</p>
    </>
  );
}
