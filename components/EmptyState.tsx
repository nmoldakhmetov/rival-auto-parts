import type { LucideIcon } from "lucide-react";

// Shared empty-state placeholder: soft icon medallion, title, hint and an
// optional call-to-action passed as children (a Link or a button). Pure
// presentational — usable from both server and client components.
export default function EmptyState({
  Icon,
  title,
  hint,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up rounded-xl border border-line bg-white px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 ring-1 ring-line">
        <Icon size={28} className="text-gray-300" strokeWidth={1.5} />
      </div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {hint && (
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {children && (
        <div className="mt-5 flex items-center justify-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
