"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Cross-component UI state:
//  • sidebarOpen — the MOBILE drawer (burger opens it, navigation closes it);
//    never persisted, a fresh page always starts with the drawer closed.
//  • collapsed  — the DESKTOP mini-sidebar mode (w-60 → w-20); persisted to
//    localStorage so the choice survives reloads and navigation.
export const useUi = create<{
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      collapsed: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    {
      name: "rival-ui",
      partialize: (s) => ({ collapsed: s.collapsed }),
    }
  )
);
