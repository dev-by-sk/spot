import { useContext } from 'react';
import { FriendsContext } from '../context/FriendsContext';

export function useFriends() {
  return useContext(FriendsContext);
}
