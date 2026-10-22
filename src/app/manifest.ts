import type { MetadataRoute } from "next";

// Painel instalável no celular (pedido dele, 22/10/2026): "Adicionar à tela inicial"
// abre como aplicativo, sem a barra do navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Secretária",
    short_name: "Secretária",
    description: "Finanças, agenda, scooter e trabalho do Renato",
    start_url: "/finance",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0d1a",
    theme_color: "#0d0d1a",
    lang: "pt-BR",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Financeiro", url: "/finance", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
      { name: "Parcelas", url: "/parcelas", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
      { name: "Scooter", url: "/scooter", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
    ],
  };
}
