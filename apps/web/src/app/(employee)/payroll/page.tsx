import { Suspense } from 'react';
import { PayrollPage } from '@/components/workspace/PayrollPage';

export const metadata = { title: 'Payroll' };

export default function PayslipsPage() {
  // useSearchParams (the selected payslip) needs a Suspense boundary.
  return (
    <Suspense>
      <PayrollPage />
    </Suspense>
  );
}
