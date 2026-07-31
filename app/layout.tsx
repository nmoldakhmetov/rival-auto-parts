import type { Metadata } from "next";
import "./globals.css";

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
