export type FollowStatus = 'pending' | 'accepted' | 'none';

export interface UserProfilePublic {
  id: string;
  username: string;
  display_name: string | null;
  profile_private: boolean;
}

export interface UserWithFollowState extends UserProfilePublic {
  follow_status: FollowStatus;
}

export interface FollowRequest {
  id: string;
  follower: UserProfilePublic;
  created_at: string;
}
