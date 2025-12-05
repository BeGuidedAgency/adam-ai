"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// If you don't have a Button component, this can just be a plain button.
// I'm using a simple styled button to keep it generic.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="
        inline-flex h-9 w-9 items-center justify-center
        rounded-full border border-transparent
        bg-transparent text-slate-700
        hover:border-[#b9a8fe] hover:text-[#b9a8fe]
        dark:text-[#f2fdff]
      "
    >
      {/* Sun in light mode */}
      <Sun className="h-4 w-4 dark:hidden" />
      {/* Moon in dark mode */}
      <Moon className="hidden h-4 w-4 dark:block" />
    </button>
  );
}
