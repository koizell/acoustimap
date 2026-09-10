# AcoustiMap

Static web application for real-time acoustic monitoring and community noise mapping.

## Tech Stack
- **Frontend**: Vanilla HTML5, CSS3 (with CSS Variables & responsive design), and JavaScript (ES6+).
- **Libraries (CDN)**: 
  - Leaflet.js (`1.9.4`) for interactive mapping (`index.html`, `script.js`).
  - Supabase JS Client (`@2`) for community measurements database (`script.js`).
- **APIs**: Web Audio API (`AudioContext`, `AnalyserNode`) for microphone decibel estimation; Geolocation API for user position & privacy blurring (~150m offset).

## Architecture & Files
- `index.html`: Main single-page interface containing tabs (Map, Health info, SDGs) and mobile control panel.
- `styles.css`: Complete styling, layout, mobile bottom sheet panel, and Leaflet map control positioning.
- `script.js`: Audio monitoring logic, Supabase client initialization/queries, Leaflet map setup (`map`, `communityLayer`), custom geolocation center control (`📍`), and location blurring (`blurLocation`).
- `OBJETIVOS.md`: Project goals, Supabase table schema (`noise_measurements`), and GitHub Pages deployment steps.

## Development & Deployment
- No build step or package manager (`npm`/`yarn`) is required.
- Run locally by opening `index.html` in a browser or serving via any static file server (e.g. Live Server, `python -m http.server`).
- Configuration: Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `script.js` with valid project credentials when deploying or connecting live.
