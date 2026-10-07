import { Suspense } from 'react';
import { TimesheetPage } from '@/components/workspace/TimesheetPage';

export const metadata = { title: 'Timesheets' };

export default function TimesheetsPage() {
  // useSearchParams (the selected week) needs a Suspense boundary.
  return (
    <Suspense>
      <TimesheetPage />
    </Suspense>
  );
}
