import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Fonte do painel: números largos e iguais (tabular), boa leitura em português no celular.
const ui = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "Secretária Eletrônica",
  description: "Assistente pessoal WhatsApp com IA",
  applicationName: "Secretária",
  icons: { icon: "/icons/app-192.png", apple: "/icons/apple-180.png" },
  appleWebApp: { capable: true, title: "Secretária", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0d0d1a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
