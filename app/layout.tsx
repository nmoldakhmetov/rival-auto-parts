import type { Metadata, Viewport } from "next";
import "./globals.css";

// PWA-поведение: интерфейс зафиксирован в масштабе 1:1, pinch-zoom отключён,
// чтобы с домашнего экрана портал ощущался нативным приложением. iOS Safari
// в обычной вкладке игнорирует user-scalable, но в standalone-режиме (ярлык
// на экране) и в Android/Chrome запрет работает.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Rival Auto Parts — B2B портал",
  description: "Закрытый оптовый портал автозапчастей",
  // iOS не читает manifest для ярлыка на домашнем экране — ему нужен
  // именно apple-touch-icon, иначе он рисует серый квадрат с буквой.
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Rival Auto",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
