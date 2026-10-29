"use client";

import { useEffect, useRef, useState } from "react";

/** Counts up to `value` once on first paint (instantly when the reader prefers reduced motion). */
export function CountUp({ value, format = "number", ms = 900 }: { value: number; format?: "number" | "inr"; ms?: number }) {
  const [shown, setShown] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = duration ? Math.min(1, (now - t0) / duration) : 1;
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format === "inr" ? compactINR(shown) : shown.toLocaleString("en-IN")}</>;
}

/** ₹ in lakh / crore, e.g. ₹1.25 Cr, ₹48.6 L (paise in). */
export function compactINR(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(1)} L`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}
