# DeviceLifeline product website

Light, product-first marketing page aligned to the approved landing mock
(“Your PC finally has a memory.”).

## Preview

```powershell
cd marketing
npx --yes serve .
```

Open `http://localhost:3000` (or the port `serve` prints).

## Design system (brief)

- Canvas: white / soft mint (`#f6faf8`)
- Accent: product green (`#0f9f6e` / deep `#0a6b4a`)
- Type: Inter + system fallbacks
- Layout: ~1180px shell, sticky header
- **Hero + gallery use live app screenshots** (not mock UI chrome)

## Live screenshots

| Asset | Source |
|-------|--------|
| `assets/hero-overview.png` | Overview (dashboard) captured from the running app |
| `assets/hero-performance.png` | Performance (sensors / SMART) captured from the running app |
| `assets/screens/` | Raw capture dumps + `capture.ps1` helper |

To refresh: bring DeviceLifeline to the foreground, capture the window, crop
window chrome if needed, and replace the `hero-*.png` files.

## Structure

| Page | Purpose |
|------|---------|
| `index.html` | Product landing (hero, gallery, privacy, download) |
| `docs.html` | **Rendered product documentation** (not raw README) |

| Landing section | Purpose |
|-----------------|---------|
| Hero | Headline, dual CTAs, trust row, live Overview screenshot |
| Gallery | Overview + Performance live shots |
| Capabilities | Health → Recovery Vault strip |
| Privacy | Local-first claims + Windows requirements |
| How it works | Capture → Explain → Act |
| Download | Installer link into `release-0.3.0/` |

Nav **Docs** and **Read documentation** point to `./docs.html`.

Wire production download URLs and analytics before public launch.
