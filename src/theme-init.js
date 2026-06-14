(() => {
  function storedTheme() {
    try {
      return localStorage.getItem("solus-theme");
    } catch {
      return "";
    }
  }

  function prefersDarkTheme() {
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    } catch {
      return false;
    }
  }

  const stored = storedTheme();
  const theme = stored === "dark" || stored === "light" ? stored : prefersDarkTheme() ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
})();
