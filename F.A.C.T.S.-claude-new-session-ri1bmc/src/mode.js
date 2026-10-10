// "BAR Builder only" build: `vite build --mode bar-builder` (npm run build:bar). It shows just the screens the
// BAR Builder needs and no FACTS header, for a page inside a site that has its own frame.
export const barOnly = () => import.meta.env.MODE === 'bar-builder';
export const BAR_SCREENS = new Set(['import', 'bars', 'schools', 'help', 'about']);
