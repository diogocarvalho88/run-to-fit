# Run to FIT

Static, browser-only running workout converter. Portuguese and English workout text becomes a Garmin FIT **workout**, with an editable review before download. No account, server, API key or data upload.

## Use

1. Paste a workout, one step per line or separated by `+`.
2. Interpret and review every step. Edit steps, repeats, duration and targets.
3. Download the `.fit` file. Connect a compatible Garmin via USB and copy it into `GARMIN/NewFiles`, then eject the watch. Device menus and USB/MTP support vary.

FIT workout files contain instructions to perform a future workout. Garmin Connect's activity import is for recorded activities; this site does not claim to synchronize workouts with Garmin Connect.

## Supported text

```text
10 min aquecimento fácil
6 x 400 m a 4:00-4:15/km com 90 s recuperação entre séries
10 min arrefecimento
```

```text
15 min warmup
4 x (3 min @ 4:30/km + 2 min easy recovery)
10 min cooldown
```

- Time: seconds, minutes, hours, `10'`, or explicit `mm:ss`; distance: metres and kilometres.
- Pace: `4:30/km`, `4:30-4:45/km`, `4'30''/km`; speed: `12 km/h`.
- Heart rate: `140-155 bpm`; HR zone: `Z2`, `zona 2`, `zone 2`.
- Manual LAP/open steps, warmup, intervals, recovery, rest and cooldown.
- Parenthesized repetitions and compact repetitions with recovery. Compact `with/com` recovery defaults to **between** repeats; the last recovery can be enabled in the review. Parenthesized sequences repeat all their steps by default.
- Unknown or ambiguous numeric instructions block download. No silent dropping of failed lines.
- Qualitative intensity is kept in notes, with no fabricated numerical target.

This is a deterministic local parser, not a general language model. Complex prose, nested repeats, progressive ramps inside a single step, percentages, RPE targets, and mixed-sport workouts are not supported. Write progressions as separate steps. Zones are the heart-rate zones configured on the watch.

## Development

Requires Node 22+.

```sh
npm ci
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

`dist/` is a self-contained static site with relative asset URLs, suitable for a project subpath on GitHub Pages. No runtime dependencies or CDN requests are needed. A small encoder implements the published FIT protocol, verifies the checksum before download, and is independently tested using the official Garmin SDK decoder. Tests check decoded content, repeats and target scaling. `dist/run-to-fit.html` is an additional single-file version that can be opened directly, including offline.

## GitHub Pages

Create a public repository named `run-to-fit`, push this project to `main`, and set **Settings → Pages → Source → GitHub Actions**. The included workflow tests, builds and deploys `dist/` on each push to `main`. Expected address: `https://<username>.github.io/run-to-fit/`.

## Format and limits

The encoder creates file ID, workout and workout-step messages as specified by Garmin. Repeat messages point to the start of their block. Each export receives a unique file identity. Dynamic fields explicitly apply milliseconds, centimetres, speed ×1000 and absolute heart rate +100. The app caps files at 50 FIT messages for conservative compatibility; the device's own limits may be lower.

Time/distance totals inferred from pace are estimates. Missing pace or open steps produce clearly marked partial totals. Device-level import still requires a compatible watch and has not been verified on physical hardware.

Optional WebMCP registration exposes the same interpretation flow on browsers implementing `document.modelContext`. It is feature-detected; unsupported browsers use the normal interface.

## References

- [Garmin FIT workout file specification](https://developer.garmin.com/fit/articles/file-types/workout.html)
- [Official Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk)
- [Garmin file backup and transfer instructions](https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6)

App source is MIT licensed. The official Garmin SDK is a development-only dependency under its own FIT Protocol License and is not distributed in the website. Not affiliated with Garmin.
