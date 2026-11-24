import { createContext, useContext } from 'react';
import type { Filter } from './model';

export interface FilterState {
  filter: Filter;
  setFilter: (f: Filter) => void;
}

export const FilterContext = createContext<FilterState>({ filter: 'future', setFilter: () => {} });

export const useFilter = () => useContext(FilterContext);
