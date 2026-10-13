// 3D avatars for the seeded demo personas (Microsoft Fluent Emoji 3D, MIT licence,
// stored in public/avatars so the demo works offline). Other users get initials.

const PHOTOS: Record<string, string> = {
  'priya shah': 'priya-shah.png',
  'tom clarke': 'tom-clarke.png',
  'olivia bennett': 'olivia-bennett.png',
  'marcus lee': 'marcus-lee.png',
  'ravi iyer': 'ravi-iyer.png',
  'sam patel': 'sam-patel.png',
  'hana kim': 'hana-kim.png',
  'alex morgan': 'alex-morgan.png',
};

/** Public URL of the user's avatar image, or null when there is none. */
export function avatarPhoto(name: string): string | null {
  const file = PHOTOS[name.trim().toLowerCase()];
  return file ? `/avatars/${file}` : null;
}
