import type { SocialIndicatorUser } from '../types/social';

function displayName(user: SocialIndicatorUser): string {
  return user.display_name || user.username;
}

export function formatSocialIndicator(friends: SocialIndicatorUser[]): string | null {
  if (friends.length === 0) return null;
  if (friends.length === 1) {
    return `${displayName(friends[0])} also saved this`;
  }
  if (friends.length === 2) {
    return `${displayName(friends[0])} and ${displayName(friends[1])} also saved this`;
  }
  return `${displayName(friends[0])}, ${displayName(friends[1])} +${friends.length - 2} also saved this`;
}
