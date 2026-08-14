"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Megaphone } from "lucide-react";

// Шапка открытой рассылки.
//
// Раньше она занимала пол-экрана телефона: ссылка назад, крупная иконка,
// заголовок, дата и весь текст рассылки — а ниже шла ещё и шапка каталога.
// Теперь это одна плотная строка: текст свёрнут до двух строк и
// разворачивается кнопкой, и только если он реально не поместился.
export default function BroadcastBanner({
  title,
  date,
  text,
}: {
  title: string;
  date: string;
  text: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div className="border-b border-line bg-white px-4 py-2 sm:px-6 sm:py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Megaphone size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h1 className="truncate text-sm font-bold leading-tight text-ink sm:text-base">
              {title}
            </h1>
            <span className="text-[11px] text-muted">{date}</span>
            <Link
              href="/catalog"
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
            >
              <ArrowLeft size={12} /> В общий каталог
            </Link>
          </div>
          {text && (
            <p
              ref={textRef}
              className={
                "mt-0.5 whitespace-pre-line text-xs leading-snug text-ink/80" +
                (expanded ? "" : " line-clamp-2")
              }
            >
              {text}
            </p>
          )}
          {/* Кнопка нужна, только если текст действительно обрезан. */}
          {clamped && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent hover:underline"
            >
              Читать полностью <ChevronDown size={12} />
            </button>
          )}
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted hover:text-ink"
            >
              Свернуть <ChevronDown size={12} className="rotate-180" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
