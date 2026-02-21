import { useContext } from 'react';
import { PlacesContext, PlacesContextValue } from '../context/PlacesContext';

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
