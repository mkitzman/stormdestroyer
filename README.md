# stormdestroyer

Coming-soon landing page for **stormdestroyer.com** — a CRT-feeling terminal with falling ASCII rain, a cursor-revealed wordmark, and lightning-on-keypress with synthesized thunder + kick (Web Audio API).

Built with **Vue 3 + Vite**. Deploys to Netlify as a static site.

## Stack

- Vue 3 (`<script setup>` SFCs)
- Vite 5
- Vanilla Web Audio for synthesized thunder / kick / stab
- No external runtime deps beyond Vue

## Local dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output → dist/
npm run preview  # serve dist/
```

## Deploy to Netlify

`netlify.toml` is already wired:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 20

Push to GitHub, link the repo in Netlify, and point the custom domain `stormdestroyer.com` at it. No further config needed.

## Project structure

```
app/
├── index.html              # Vite entry
├── netlify.toml            # build + headers config
├── package.json
├── vite.config.js
└── src/
    ├── main.js             # createApp + mount
    ├── App.vue
    ├── audio.js            # Web Audio engine → window.SDAudio
    ├── styles.css          # global styles
    └── components/
        └── StormTerminal.vue
```

## Interactions

| Input              | Effect                                           |
|--------------------|--------------------------------------------------|
| Move cursor        | Pushes ASCII rain aside, reveals wordmark        |
| Click / tap        | Summons lightning bolt + thunder + kick          |
| Press any key      | Same — bolt drops near cursor + key echoes       |
| Sound toggle pill  | Enables/disables synthesized audio (default off) |

## Notes

- Audio is muted by default and requires a user gesture (the toggle pill) to start, per browser autoplay policy.
- Cursor is hidden globally (`cursor: none`) and replaced with the in-canvas crosshair.
- The full chrome + grid + static exploration that this concept came from lives one level up in `Stormdestroyer.html` (design-canvas with all 3 directions side-by-side).
