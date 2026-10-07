/** Always visible on every page (playbook section 10). */
export function PrototypeBanner() {
  return (
    <div
      role="note"
      data-testid="prototype-banner"
      className="flex h-7 items-center justify-center bg-slate-900 px-4 text-center text-[11px] font-medium tracking-wide text-slate-300"
    >
      Prototype — synthetic data, mocked integrations
    </div>
  );
}
