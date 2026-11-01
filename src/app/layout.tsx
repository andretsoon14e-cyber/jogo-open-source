import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GAME_TITLE } from "@/game/identity";
import "./globals.css";

export const metadata: Metadata = {
  title: GAME_TITLE,
  description:
    `${GAME_TITLE}: sobreviva a hordas noturnas, cerque sua clareira, melhore armas e escape da ilha. Singleplayer e multiplayer em rede local.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 antialiased overscroll-none">{children}</body>
    </html>
  );
}
