"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSearch } from "@/store/search";

// Clears the global search box on section navigation (Главная → Корзина →
// Избранное …), so a stale query never follows the user around the portal.
// Two deliberate exceptions:
//  • the very first render (deep links / page refresh keep their state);
//  • navigations that carry their own ?q= (header submit, shared links) —
//    the catalog picks that query up itself.
// Filter/pagination changes inside the catalog don't change the pathname, so
// they never trigger a reset.
export default function SearchReset() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setQuery = useSearch((s) => s.setQuery);
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const was = prevPath.current;
    prevPath.current = pathname;
    if (was === null || was === pathname) return;
    if (searchParams.get("q")) return;
    setQuery("");
  }, [pathname, searchParams, setQuery]);

  return null;
}
