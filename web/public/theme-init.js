// Applies the saved theme before first paint (kept as a file so the CSP can forbid inline scripts).
(function () {
  try {
    var t = localStorage.getItem('ls-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
