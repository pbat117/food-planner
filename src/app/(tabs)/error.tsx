'use client';

export default function TabError() {
  const startOver = () => {
    try {
      localStorage.removeItem('planner.lastTrip');
    } catch {
      // storage blocked: nothing to clear
    }
    location.reload(); // the bad plan is also held in memory above this boundary
  };
  return (
    <div className="mx-4 mt-16 rounded-[10px] bg-cell px-5 py-8 text-center">
      <p className="text-title2 font-semibold">This screen couldn&apos;t load</p>
      <p className="mt-2 text-subhead text-secondary">Your settings are safe. Clearing the saved list usually fixes it.</p>
      <button type="button" onClick={startOver} className="mt-6 min-h-[50px] w-full rounded-[12px] bg-tint text-headline font-semibold text-white">
        Clear saved list and reload
      </button>
    </div>
  );
}
