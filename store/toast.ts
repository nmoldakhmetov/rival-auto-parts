"use client";

import { create } from "zustand";

// Global toast feedback layer. Any client component can call
// `toast.success("…")` — the <Toasts/> outlet in the portal layout renders
// the stack bottom-right and auto-dismisses after a few seconds.

export type ToastKind = "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; text: string };

type ToastState = {
  toasts: Toast[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: number) => void;
};

let seq = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      3800
    );
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience API: toast.success("Готово") / toast.error("Ошибка") / toast.info(...)
export const toast = {
  success: (text: string) => useToasts.getState().push("success", text),
  error: (text: string) => useToasts.getState().push("error", text),
  info: (text: string) => useToasts.getState().push("info", text),
};
