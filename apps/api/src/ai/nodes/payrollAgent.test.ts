import type { DecisionResult, Output, State } from '../graph/state';
import { PAYROLL_EXPLANATION_WITHDRAWN, payrollCompose } from './payrollAgent';
import { stubPayrollRecords } from './stubs';

const facts = stubPayrollRecords({ payroll: null } as unknown as State).payroll!;
const output = (over: object) => ({
  text: '',
  citations: [],
  uncovered: [],
  withdrawn: false,
  ...over,
});
const citation = {
  marker: 'S1',
  chunkId: 'c',
  documentId: 'd',
  docTitle: 'Loss of Pay (LOP)',
  sectionPath: [],
  effectiveDate: '2026-01-01',
};

describe('payrollCompose', () => {
  it('uses a checked explanation with its citations', () => {
    const u = payrollCompose({
      payroll: facts,
      output: output({ text: 'Policy [S1].', citations: [citation] }),
    } as unknown as State);
    expect(u.decision).toMatchObject({ value: 'ANSWER', reasonCode: 'PAYROLL_EXPLAINED' });
    expect((u.output as Output).text).toContain('Policy [S1].');
    expect(u.trace).toBeUndefined();
  });

  it('records a withdrawn explanation with its own reason and flag, and shows records only', () => {
    const u = payrollCompose({
      payroll: facts,
      output: output({ text: 'Withdrawn template', withdrawn: true }),
    } as unknown as State);
    expect((u.decision as DecisionResult).reasonCode).toBe(PAYROLL_EXPLANATION_WITHDRAWN);
    expect(u.trace).toEqual({ flags: [PAYROLL_EXPLANATION_WITHDRAWN] });
    expect(u.output).toMatchObject({ withdrawn: false, citations: [] });
    expect((u.output as Output).text).toContain('could not find a policy passage I can cite');
  });

  it('no explanation at all is records only, without a withdrawal flag', () => {
    const u = payrollCompose({ payroll: facts, output: output({}) } as unknown as State);
    expect((u.decision as DecisionResult).reasonCode).toBe('PAYROLL_RECORDS_ONLY');
    expect(u.trace).toBeUndefined();
  });
});
