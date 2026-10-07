// Safety escalation (decision ESCALATE, reason SAFETY): the policy's safety
// steps are streamed with citations first, then a ticket draft is prepared.
export function SafetyNotice() {
  return (
    <div
      data-testid="safety-notice"
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <span className="font-semibold">Safety first:</span> follow these steps now. A ticket is being
      prepared so a person can help.
    </div>
  );
}
