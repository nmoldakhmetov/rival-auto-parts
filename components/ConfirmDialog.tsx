"use client";

import { useEffect } from "react";
import { HelpCircle } from "lucide-react";

// Confirmation modal for critical actions (checkout, return requests).
// Escape and the backdrop cancel; «Да» confirms.
export default function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Да",
  cancelLabel = "Нет",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
      aria-hidden
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in-up w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <HelpCircle size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug text-ink">
              {title}
            </h2>
            {text && (
              <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            )}
          </div>
        </div>
        {/* type="button": the dialog may live inside a <form> (returns) —
            plain buttons would submit it and instantly re-open the dialog. */}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="btn-accent"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
