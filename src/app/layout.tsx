import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secretária Eletrônica",
  description: "Assistente pessoal WhatsApp com IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
