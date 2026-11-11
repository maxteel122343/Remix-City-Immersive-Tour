# City 3D Immersive Tour — San Francisco & Beyond

An interactive, cinematic 3D urban tour web application built with **Google Maps Platform Web Components (Maps 3D API & Places UI Kit)**, React 19, TypeScript, and Tailwind CSS.

---

## 🌟 What This Tool Does

- **Cinematic 3D Camera Navigation**: Smoothly glides across photorealistic 3D cityscapes with dynamic altitude, tilt (pitch), and heading transitions using `<gmp-map-3d>`.
- **Curated Multi-City Tours**: Tour iconic landmarks across global cities (San Francisco, Paris, Venice, Tokyo, Singapore, and more).
- **Unified Bottom Dock**: Seamless, single-panel bottom dock combining the live place info card and navigation deck with zero separation. Place info is active by default and easily collapsed or expanded.
- **Smart 3D Markers**: In-place marker reuse without duplicates. When a place is selected, its existing marker turns vibrant emerald green with crisp white detailing and a clean pin tip (no bottom shadow).
- **Places UI Kit Details**: Live rich metadata overlays (ratings, review counts, open status, categories, photos, and direct links) powered by `<gmp-advanced-place-details-compact>` and full details.
- **Saved Places & Custom Itineraries**: Add custom points of interest via search or map POI click, with City, Saved, and Combined tour modes.
- **Map View Modes & Controls**: Switch between **Hybrid / 3D Mesh**, **Satellite**, and **Roadmap**, with "Lock North", POI orbit rotation, camera speed, and dark/light themes.

---

## 🗺️ Google Maps Platform APIs Used

1. **Maps JavaScript API (3D Maps)**
   - `<gmp-map-3d>`: High-performance WebGL 3D photorealistic mesh tiles renderer.
   - `<gmp-marker-3d>` / `<gmp-marker-3d-interactive>`: 3D-space anchored markers with elevation and custom pin templates.
   - Native camera controls: `flyCameraTo`, `flyCameraAround`, `center`, `range`, `tilt`, `heading`, `roll`.

2. **Places UI Kit & Places Library**
   - `<gmp-advanced-place-details-compact>` & `<gmp-advanced-place-details>`: Accessible, responsive place cards.
   - `<gmp-place-details-place-request>`: Requests place information using Place IDs.
   - `<gmp-place-media>`: Place photos with lightbox support.
   - `<gmp-place-rating>`, `<gmp-place-open-now-status>`, `<gmp-place-type>`, `<gmp-place-price>`, `<gmp-place-attribution>`.
   - Autocomplete place search and reverse POI resolution.

3. **Google Maps Demo Key & Quota Support**
   - Free prototyping with Google Maps Demo Key support and instant fallback rendering.

---

## 🔑 Setup & Demo API Key

### Default Behavior
The application is pre-configured with a default demo key environment variable (`VITE_GOOGLE_MAPS_API_KEY`) for instant prototyping.

### Setting Up Your Own Key in the UI
1. Click the **Key** button in the top navigation bar.
2. In the modal:
   - Paste your **Google Maps Platform API Key** (`AIzaSy...`) or a custom **Google Maps Demo Key**.
   - Click **Save & Reload Map**.
   - Your key is saved locally in your browser (`localStorage`) and used for all subsequent 3D map and Places requests.
3. Click **Reset to Demo Key** anytime to revert to the built-in demo environment.

### Setting Up Your Own Key via `.env`
Create or edit `.env` in the root directory:
```env
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```