"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Largura real (px) do elemento. Nos gráficos SVG, usar essa largura no
 * viewBox faz 1 unidade = 1 px: as letras ficam do mesmo tamanho no celular e
 * no computador (com viewBox fixo elas encolhem/esticam junto com a tela).
 */
export function useWidth<T extends Element>(fallback: number, min = 280) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setWidth(Math.max(min, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}
