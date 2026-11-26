"use client";

import { useEffect, useState } from "react";

type Papel = "dono" | "personal";
// Uma pergunta por página aberta, dividida entre o menu e as telas.
let pedido: Promise<Papel> | null = null;
let sabido: Papel | null = null;

/** "dono", "personal" (irmão: só Treino e Corpo) ou null enquanto carrega. */
export function usePapel(): Papel | null {
  const [papel, setPapel] = useState<Papel | null>(sabido);
  useEffect(() => {
    pedido ??= fetch("/api/auth").then((r) => r.json()).then((j) => (j.papel === "personal" ? "personal" : "dono") as Papel).catch(() => "dono" as Papel);
    pedido.then((p) => { sabido = p; setPapel(p); });
  }, []);
  return papel;
}
