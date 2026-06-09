"use client";

import { create } from "zustand";

// Shared search query between the global Header and the Catalog table.
export const useSearch = create<{
  query: string;
  setQuery: (q: string) => void;
}>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
