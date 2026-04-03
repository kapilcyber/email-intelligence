"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return useMemo(
    () => ({
      isDark,
      grid: isDark ? "#3f3f46" : "#e5e7eb",
      gridSlate: isDark ? "rgba(63, 63, 70, 0.75)" : "rgba(203, 213, 225, 0.45)",
      axis: isDark ? "#a1a1aa" : "#475569",
      axisMuted: isDark ? "#71717a" : "#64748b",
      tooltipBg: isDark ? "hsl(222 35% 11%)" : "rgba(255, 255, 255, 0.98)",
      tooltipBorder: isDark ? "hsl(217 32% 30%)" : "rgba(148, 163, 184, 0.35)",
      tooltipShadow: isDark ? "0 12px 40px rgba(0, 0, 0, 0.5)" : "0 12px 40px rgba(15, 23, 42, 0.1)",
      tooltipFg: isDark ? "hsl(210 40% 96%)" : "hsl(222 47% 11%)",
      labelFill: isDark ? "#d4d4d8" : "#475569",
      polarGrid: isDark ? "#52525b" : "#bfdbfe",
    }),
    [isDark]
  );
}

export function chartTooltipProps(c: ReturnType<typeof useChartTheme>): {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
} {
  return {
    contentStyle: {
      borderRadius: 12,
      border: `1px solid ${c.tooltipBorder}`,
      boxShadow: c.tooltipShadow,
      padding: "10px 14px",
      background: c.tooltipBg,
      color: c.tooltipFg,
    },
    labelStyle: { color: c.tooltipFg, fontWeight: 600, marginBottom: 4 },
  };
}
