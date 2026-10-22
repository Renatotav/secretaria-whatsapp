import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
