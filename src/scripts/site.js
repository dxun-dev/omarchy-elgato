const themes = [
  ['tokyo', 'Tokyo Night'],
  ['gruvbox', 'Gruvbox'],
  ['catppuccin', 'Catppuccin'],
];
const themeButton = document.querySelector('#theme');
let currentTheme = 0;
try {
  const saved = localStorage.getItem('elgato-site-theme');
  const index = themes.findIndex(([id]) => id === saved);
  if (index >= 0) currentTheme = index;
} catch {}
function applyTheme() {
  const [id, label] = themes[currentTheme];
  document.documentElement.dataset.theme = id;
  themeButton.querySelector('span').textContent = label;
  themeButton.setAttribute(
    'aria-label',
    `Color theme: ${label}. Activate to change theme.`,
  );
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue('--bg')
    .trim();
}
applyTheme();
themeButton.addEventListener('click', () => {
  currentTheme = (currentTheme + 1) % themes.length;
  applyTheme();
  try {
    localStorage.setItem('elgato-site-theme', themes[currentTheme][0]);
  } catch {}
});
document.querySelector('#copy')?.addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(
      document
        .querySelector('#install-command')
        .textContent.trim()
        .replace(/\s+/g, ' '),
    );
    status.textContent = 'Install command copied.';
  } catch {
    status.textContent = 'Select the command and copy it manually.';
  }
});
