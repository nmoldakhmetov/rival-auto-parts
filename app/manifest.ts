import type { MetadataRoute } from "next";

// Web-app manifest: без него ярлык «на экран Домой» получает системную
// заглушку с первой буквой имени вместо логотипа.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rival Auto Parts — B2B портал",
    short_name: "Rival Auto",
    description: "Закрытый оптовый портал автозапчастей",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#222222",
    lang: "ru",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
