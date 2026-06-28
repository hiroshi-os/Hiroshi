"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function PixelThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-10 h-5 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 p-[1px]" />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative w-10 h-5 border border-zinc-400 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-950 p-[1px] cursor-pointer flex items-center transition-colors duration-200 focus:outline-none"
      aria-label="Theme Switcher"
    >
      <div
        className={`w-3.5 h-3.5 transition-transform duration-200 border ${
          isDark
            ? "translate-x-[20px] bg-zinc-200 border-zinc-300 dark:bg-zinc-200 dark:border-zinc-300"
            : "translate-x-0 bg-zinc-800 border-zinc-700 dark:bg-zinc-800 dark:border-zinc-700"
        }`}
      />
    </button>
  );
}
