// Apply the saved appearance before the app's first paint.
(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("ultron.theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {
    /* Use the system appearance. */
  }
  const theme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
