// Applies the saved or system theme before React renders, to avoid a flash of
// the wrong theme. Kept as an external file so the CSP needs no 'unsafe-inline'.
(function () {
  var theme = "system";
  try {
    theme = localStorage.getItem("tidylnk.theme") || "system";
  } catch (e) {}
  var dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
