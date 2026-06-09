import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Boxes, Warehouse, Truck } from "lucide-react";

export const metadata = {
  title: "Rival Auto Parts — оптовый портал автозапчастей",
};

const BRANDS = [
  "Toyota",
  "Lexus",
  "Mercedes-Benz",
  "BMW",
  "Hyundai",
  "Kia",
  "Nissan",
  "Mitsubishi",
  "Volkswagen",
  "Audi",
  "Honda",
  "Chevrolet",
];

const FEATURES = [
  { Icon: Boxes, title: "Тысячи позиций", text: "Оригинал и качественные аналоги" },
  {
    Icon: Warehouse,
    title: "Остатки по складам",
    text: "Актуальное наличие в реальном времени",
  },
  {
    Icon: Truck,
    title: "Быстрая отгрузка",
    text: "Обработка заявок в день обращения",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#333333] via-[#1d1d1d] to-black p-8 shadow-md sm:p-12">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-6rem] right-40 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

        {/* Brand watermark — bleeds off the bottom-right edge */}
        <Image
          src="/logo-compact.jpg"
          alt="Rival Auto"
          width={300}
          height={375}
          priority
          className="pointer-events-none absolute -bottom-10 -right-10 select-none opacity-20 mix-blend-screen sm:-right-6 sm:scale-110"
        />

        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
            B2B-портал оптовых поставок
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            Автозапчасти <span className="text-accent">оптом</span>
            <br className="hidden sm:block" /> для вашего бизнеса
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/60 sm:text-base">
            Умный подбор по артикулу и применяемости, персональные остатки по
            складам и оформление заявок в один клик.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="btn-accent shadow-sm transition-all duration-200 hover:shadow-md"
            >
              Перейти в каталог <ArrowRight size={16} />
            </Link>
            <Link
              href="/contacts"
              className="btn border border-white/15 bg-white/5 text-white transition-all duration-200 hover:bg-white/10"
            >
              Связаться с нами
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-3 rounded-xl border border-line bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <f.Icon size={20} />
            </div>
            <div>
              <div className="font-bold text-ink">{f.title}</div>
              <div className="text-xs text-muted">{f.text}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Brand catalogs */}
      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink sm:text-2xl">
              Оригинальные каталоги
            </h2>
            <p className="text-sm text-muted">
              Подбор запчастей по марке автомобиля
            </p>
          </div>
          <Link
            href="/catalog"
            className="shrink-0 text-sm font-semibold text-accent hover:underline"
          >
            Все запчасти →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {BRANDS.map((b) => (
            <Link
              key={b}
              href={`/catalog?make=${encodeURIComponent(b)}`}
              className="group flex h-24 items-center justify-center rounded-xl border border-line bg-white p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-md"
            >
              <span className="text-base font-extrabold tracking-tight text-ink/80 transition-colors duration-200 group-hover:text-accent">
                {b}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
