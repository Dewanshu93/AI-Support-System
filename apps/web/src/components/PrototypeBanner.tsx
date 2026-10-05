/** Always visible on every page (playbook section 10). */
export function PrototypeBanner() {
  return (
    <div
      role="note"
      data-testid="prototype-banner"
      className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900"
    >
      Prototype — synthetic data, mocked integrations
    </div>
  );
}
