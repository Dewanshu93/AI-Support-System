import { SkeletonCards } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-10">
      <SkeletonCards />
    </main>
  );
}
