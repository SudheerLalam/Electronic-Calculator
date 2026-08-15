# ElectroCalc

**Practical Electronics Calculators for Students**

A free, offline-capable electronics calculator hub built for ECE, EEE and engineering students. 24 calculators covering Ohm's Law, resistors, LEDs, RC/RL circuits, signals and more — plus a searchable formula reference, calculation history and favorites.

Calculate faster. Understand better. Build smarter.

## Features

- **24 working calculators** across 7 categories (Basic Electrical, Resistors, LED & Diodes, Circuit Analysis, Signals & Communication, Battery & Power, Converters)
- **Resistor color code** — both directions: colors → resistance and resistance → colors, with a live SVG resistor visual
- **SMD resistor decoder** — 3-digit, 4-digit and R-notation codes
- **Searchable formula reference** — 14 categories of core electronics formulas
- **Calculation history** — last 50 calculations, stored locally
- **Favorites** — star any calculator for quick access
- **Global search** — search calculators by name, category, or formula
- **Dark (default olive/black) and light themes**
- **Fully responsive** — mobile hamburger menu, single-column mobile layout, dashboard layout on desktop
- **No backend, no external JS libraries** — pure HTML/CSS/JavaScript, works entirely client-side
- **Accessible** — labeled inputs, keyboard navigation, visible focus states, ARIA attributes

## Tech stack

- HTML5, CSS3, vanilla JavaScript (no frameworks, no build step)
- `localStorage` for history and favorites (nothing is ever sent to a server)
- Google Fonts (Space Grotesk, IBM Plex Sans, IBM Plex Mono) loaded via CDN — the only external resource

## File structure

```
electrocalc/
├── index.html      # App shell + all view containers
├── style.css        # Olive/black design system
├── script.js         # All routing, data and calculator logic
├── favicon.svg
├── README.md
├── robots.txt
└── sitemap.xml
```

## Running locally

No build step is required. Either:

1. Open `index.html` directly in a browser, or
2. Serve the folder with any static file server, e.g.:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```

## Deploying

**GitHub Pages**: push this folder to a repository and enable Pages on the `main` branch (root). No configuration needed.

**Vercel**: import the repository — Vercel will detect it as a static site automatically. No build command or output directory is required.

Before deploying to production, update the placeholder domain (`electrocalc.example.com`) in `index.html`, `sitemap.xml` and `robots.txt` with your real domain.

## Notes on accuracy

All calculators validate inputs and never render `NaN`, `undefined` or `Infinity` — invalid combinations show a friendly message instead. Real-world results (battery runtime, LED resistor ratings, etc.) are estimates; always apply appropriate safety margins in a physical build.
