/**
 * The "today" of every E2E run (seed anchor and the API's DEMO_TODAY). With
 * 2026-10-08 the LOP demo day is Fri 11 Sept 2026 (Loss of Pay $400.00 on the
 * 16–30 Sept payslip). Changing it invalidates the recorded LLM replies.
 */
export const E2E_TODAY = process.env.E2E_TODAY ?? '2026-10-08';
