"use client";

import { useEffect, useState } from "react";

/** "dono", "personal" (irmão: só Treino e Corpo) ou null enquanto carrega. */
export function usePapel(): "dono" | "personal" | null {
  const [papel, setPapel] = useState<"dono" | "personal" | null>(null);
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((j) => setPapel(j.papel === "personal" ? "personal" : "dono")).catch(() => setPapel("dono"));
  }, []);
  return papel;
}
