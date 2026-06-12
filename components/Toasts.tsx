"use client";

import { CheckCircle2, TriangleAlert, Info, X } from "lucide-react";
import { useToasts, type ToastKind } from "@/store/toast";

const KIND: Record<
  ToastKind,
  { Icon: typeof Info; iconCls: string; barCls: string }
> = {
  success: { Icon: CheckCircle2, iconCls: "text-green-600", barCls: "bg-green-500" },
  error: { Icon: TriangleAlert, iconCls: "text-accent", barCls: "bg-accent" },
  info: { Icon: Info, iconCls: "text-blue-600", barCls: "bg-blue-500" },
};

// Fixed bottom-right toast stack (above modals: broadcasts z-150, block z-200).
export default function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[250] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => {
        const k = KIND[t.kind];
        return (
          <div
            key={t.id}
            className="animate-fade-in-up pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-line bg-white py-3 pl-4 pr-9 shadow-lg"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${k.barCls}`} />
            <k.Icon size={17} className={`mt-px shrink-0 ${k.iconCls}`} />
            <div className="text-sm leading-snug text-ink">{t.text}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-gray-100 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
