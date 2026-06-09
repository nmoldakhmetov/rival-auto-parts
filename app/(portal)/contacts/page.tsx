import { Phone, Mail, MapPin, Clock, Building2 } from "lucide-react";

export const metadata = { title: "Контакты — Rival Auto Parts" };

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

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Контакты</h1>
      <p className="mt-1 text-sm text-muted">
        Магазины, отделы продаж и режим работы
      </p>

      {/* Departments */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
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
      </section>

      {/* Stores */}
      <h2 className="mb-4 mt-10 text-xl font-bold text-ink">Наши магазины</h2>
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
                <h3 className="text-base font-bold text-ink">{s.name}</h3>
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
    </div>
  );
}
