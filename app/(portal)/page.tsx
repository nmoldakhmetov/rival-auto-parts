import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Boxes,
  Warehouse,
  Truck,
  Phone,
  Mail,
  MapPin,
  Clock,
  Building2,
} from "lucide-react";

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

// ─── Contacts (merged from the former /contacts page) ────────────────────

const DEPTS = [
  {
    label: "Розничный отдел",
    phone: "+7 (776) 710-30-17",
    tel: "+77767103017",
    email: "rauto.manager.4@gmail.com",
  },
  {
    label: "Оптовый отдел",
    phone: "+7 (776) 710-30-14",
    tel: "+77767103014",
    email: "rivalautokz.1@gmail.com",
  },
];

type Staff = {
  name: string;
  role: string;
  phone: string;
  tel: string;
  email: string;
};
type Store = {
  name: string;
  address: string;
  mapQuery: string;
  phone?: string;
  tel?: string;
  email?: string;
  staff: Staff[];
};

const STORES: Store[] = [
  {
    name: "ТД «Бакорда»",
    address:
      "г. Алматы, 050061, ул. Рыскулова 103/21б, ТД «Бакорда», 2 этаж, бутик 96А",
    mapQuery: "ул. Рыскулова 103/21б, Алматы",
    staff: [],
  },
  {
    name: "ТД «Car City»",
    address:
      "г. Алматы, 050031, ул. Баянауыл 57а, ТД «Car City», 2 ярус, 4 ряд, 189 бутик",
    mapQuery: "ул. Баянауыл 57а, Алматы",
    phone: "+7 (776) 293-56-30",
    tel: "+77762935630",
    email: "rauto.manager.4@gmail.com",
    staff: [
      {
        name: "Рафи",
        role: "Продавец",
        phone: "+7 (776) 293-56-30",
        tel: "+77762935630",
        email: "rauto.manager.4@gmail.com",
      },
    ],
  },
];

function mapSrc(q: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
}

function WorkHours() {
  return (
    <div className="flex items-start gap-2">
      <Clock size={15} className="mt-0.5 shrink-0 text-accent" />
      <div className="text-xs leading-relaxed">
        <div>
          <span className="font-medium text-ink">Вт – Вс:</span>{" "}
          <span className="text-muted">09:00 – 18:00</span>
        </div>
        <div>
          <span className="font-medium text-ink">Пн:</span>{" "}
          <span className="text-muted">выходной</span>
        </div>
      </div>
    </div>
  );
}

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
            <a
              href="#contacts"
              className="btn border border-white/15 bg-white/5 text-white transition-all duration-200 hover:bg-white/10"
            >
              Связаться с нами
            </a>
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

      {/* Contacts (merged from the former /contacts page) */}
      <section id="contacts" className="mt-20 border-t border-line pt-10">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-ink sm:text-2xl">Контакты</h2>
          <p className="text-sm text-muted">
            Магазины, отделы продаж и режим работы
          </p>
        </div>

        {/* Departments */}
        <div className="grid gap-4 sm:grid-cols-3">
          {DEPTS.map((d) => (
            <div
              key={d.label}
              className="rounded-xl border border-line bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {d.label}
              </div>
              <a
                href={`tel:${d.tel}`}
                className="mt-2 flex items-center gap-2 text-base font-bold text-ink transition-colors hover:text-accent"
              >
                <Phone size={16} className="text-accent" /> {d.phone}
              </a>
              <a
                href={`mailto:${d.email}`}
                className="mt-1.5 flex items-center gap-2 truncate text-sm text-muted transition-colors hover:text-accent"
              >
                <Mail size={14} /> {d.email}
              </a>
            </div>
          ))}
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Режим работы
            </div>
            <div className="mt-2">
              <WorkHours />
            </div>
          </div>
        </div>

        {/* Stores */}
        <h3 className="mb-4 mt-10 text-xl font-bold text-ink">Наши магазины</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          {STORES.map((s) => (
            <div
              key={s.name}
              className="overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="p-5">
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Building2 size={18} />
                  </div>
                  <h4 className="text-base font-bold text-ink">{s.name}</h4>
                </div>

                <div className="flex items-start gap-2 text-sm text-ink">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-accent" />
                  <span>{s.address}</span>
                </div>

                <div className="mt-3">
                  <WorkHours />
                </div>

                {s.phone && (
                  <div className="mt-3 space-y-1">
                    <a
                      href={`tel:${s.tel}`}
                      className="flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-accent"
                    >
                      <Phone size={14} className="text-accent" /> {s.phone}
                    </a>
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-accent"
                      >
                        <Mail size={13} /> {s.email}
                      </a>
                    )}
                  </div>
                )}

                {s.staff.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Сотрудники офиса
                    </div>
                    <div className="space-y-2">
                      {s.staff.map((p) => (
                        <div
                          key={p.name + p.tel}
                          className="flex items-center gap-3 rounded-lg bg-gray-50 p-2.5"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 font-bold text-accent">
                            {p.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink">
                              {p.name}{" "}
                              <span className="font-normal text-muted">
                                · {p.role}
                              </span>
                            </div>
                            <a
                              href={`tel:${p.tel}`}
                              className="text-xs text-muted transition-colors hover:text-accent"
                            >
                              {p.phone}
                            </a>
                            <a
                              href={`mailto:${p.email}`}
                              className="block truncate text-xs text-muted transition-colors hover:text-accent"
                            >
                              {p.email}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <iframe
                src={mapSrc(s.mapQuery)}
                title={`Карта — ${s.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-56 w-full border-t border-line"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
