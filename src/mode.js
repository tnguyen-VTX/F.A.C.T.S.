// "Suite page" builds: `vite build --mode bar-builder` (npm run build:bar) and `--mode jem` (npm run build:jem). Each shows
// just the screens its tool needs and no FACTS header, for a page inside a site that has its own frame. The default
// build is the whole FACTS app.
const MODE = () => import.meta.env.MODE;
const PAGES = {
  'bar-builder': {
    title: 'BAR Builder',
    home: 'bars',
    homeLabel: 'Open the BAR Builder',
    screens: ['import', 'bars', 'schools', 'help', 'about'],
  },
  jem: {
    title: 'Journal Entry Maker',
    home: 'jem',
    homeLabel: 'Open the Journal Entry Maker',
    screens: ['import', 'jem', 'schools', 'help', 'about'],
  },
};
const page = () => PAGES[MODE()] || null;
export const barOnly = () => !!page(); // true for either suite page
export const pageTitle = () => page()?.title || '';
export const homeScreen = () => page()?.home || 'budget';
export const homeLabel = () => page()?.homeLabel || 'Open the budget';
export const pageScreens = () => new Set(page()?.screens || []);
export const BAR_SCREENS = new Set(PAGES['bar-builder'].screens);
