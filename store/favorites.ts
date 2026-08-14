"use client";

import { create } from "zustand";

// Счётчик избранного для значка в меню.
//
// Живёт в сторе, а не внутри сайдбара: сердечко жмут в каталоге и на самой
// странице избранного, и значок должен меняться сразу, а не после перехода
// по разделам — как это работает у корзины.
type FavoritesState = {
  count: number;
  setCount: (n: number) => void;
};

export const useFavorites = create<FavoritesState>((set) => ({
  count: 0,
  setCount: (n) => set({ count: Math.max(0, n) }),
}));
