(() => {
  try {
    const stored = localStorage.getItem("solus-theme");
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = stored || (prefersDark ? "dark" : "light");
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
