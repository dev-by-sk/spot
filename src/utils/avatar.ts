const AVATAR_COLORS = [
  '#047857', // emerald
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#EA7C2A', // orange
  '#0D9488', // teal
  '#DC2626', // red
  '#A15F37', // brown
  '#4F46E5', // indigo
  '#0891B2', // cyan
  '#65A30D', // lime
  '#CA8A04', // yellow
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(username: string): string {
  return AVATAR_COLORS[hashString(username) % AVATAR_COLORS.length];
}

export function getAvatarInitials(displayName: string | null, username: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}
