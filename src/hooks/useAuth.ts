import { useContext } from 'react';
import { AuthContext, AuthContextValue } from '../context/AuthContext';

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
