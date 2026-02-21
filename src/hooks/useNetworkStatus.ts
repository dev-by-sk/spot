import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Fetch actual state on mount instead of defaulting to true
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  return isOnline;
}
