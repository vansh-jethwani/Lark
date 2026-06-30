import { useEffect, useLayoutEffect, useState } from "react";
import { DEFAULT_THEME_PRESET_ID } from "../data/herouiThemePresets";
import { applyThemePresetToDocument, isValidThemePreset, ThemeContext } from "./theme";

function getSystemTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark" || theme === "system") return theme;

  return "system";
}

function applyDomTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

function readStoredThemePreset() {
  const themePreset = localStorage.getItem("theme-preset");
  if (themePreset && isValidThemePreset(themePreset)) return themePreset;

  return DEFAULT_THEME_PRESET_ID;
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [themePreset, setThemePresetState] = useState(readStoredThemePreset);
  const theme = themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(media.matches ? "dark" : "light");

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  // this applies light/dark mode
  useLayoutEffect(() => {
    applyDomTheme(theme);
  }, [theme]);

  // this applies the theme preset, like sky, spotify, etc.
  useLayoutEffect(() => {
    applyThemePresetToDocument(themePreset);
  }, [themePreset]);

  // this stores the theme and theme preset in local storage
  useEffect(() => {
    localStorage.setItem("theme", themePreference);
    localStorage.setItem("theme-preset", themePreset);
  }, [themePreference, themePreset]);

  const setTheme = (next) => setThemePreferenceState(next);

  const toggleTheme = () => {
    setThemePreferenceState((t) => (t === "dark" ? "light" : "dark"));
  };

  const setThemePreset = (next) => {
    setThemePresetState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      return isValidThemePreset(resolved) ? resolved : DEFAULT_THEME_PRESET_ID;
    });
  };

  const value = { theme, themePreference, setTheme, toggleTheme, themePreset, setThemePreset };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
