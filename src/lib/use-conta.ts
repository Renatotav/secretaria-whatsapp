"use client";

import { useEffect, useState } from "react";

/** Número que conta até o valor ao abrir (sem animação se o celular pede menos movimento). */
export function useConta(alvo: number, ms = 900): number {
  const [v, setV] = useState(alvo);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(alvo); return; }
    const ini = performance.now(), de = alvo * 0.92;
    let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - ini) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(de + (alvo - de) * e);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}
