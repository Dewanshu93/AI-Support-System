'use client';

// Round 3D avatar (lib/avatars.ts); initials when the user has no photo or it
// fails to load. The name is the accessible label.
import Image from 'next/image';
import { useState } from 'react';
import { avatarPhoto } from '@/lib/avatars';
import { initials } from '@/lib/format';

const SIZES = {
  sm: { box: 'h-8 w-8 text-xs', px: 32 },
  md: { box: 'h-10 w-10 text-sm', px: 40 },
  lg: { box: 'h-12 w-12 text-sm', px: 48 },
} as const;

export function Avatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const photo = failed ? null : avatarPhoto(name);
  const { box, px } = SIZES[size];
  const frame = `relative inline-block shrink-0 overflow-hidden rounded-full ring-2 ring-surface ${box} ${className}`;

  if (!photo) {
    return (
      <span
        role="img"
        aria-label={name}
        data-testid="avatar"
        className={`${frame} grid place-items-center bg-brand-600 font-semibold text-white`}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <span data-testid="avatar" className={`${frame} bg-linear-to-b from-sky-100 to-brand-100`}>
      <Image
        src={photo}
        alt={name}
        title={name}
        width={px}
        height={px}
        className="h-full w-full object-contain p-[8%] pt-[12%]"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
