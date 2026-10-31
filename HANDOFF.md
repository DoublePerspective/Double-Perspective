# Handoff: Double Perspective website (formerly Kindred Compass Games)

Status as of **2026-10-17**. Written so a new Claude session (or person) can pick up where the last one stopped. Read this first, then `README.md`.

## What this repo is

The **studio website** only: a static site hosted on GitHub Pages with no build step. Edit the HTML/CSS directly and push to `main` to publish.

- Live site: https://doubleperspective.github.io/Double-Perspective/
- Contact/support address used on the site: doubleperspective.contact@gmail.com

**The game source code is not in this repo.** Umbral Purge and Zenith & Zero Sudoku live somewhere else (on the developer's computer or in other Claude chats/projects). A session continuing game work needs those files uploaded or another repo connected.

## Estivite 1.2 (added 2026-10-31)

Estivite now includes the old Workshop Calculator: a fourth project, **Siding**, a **Quick tools** tab (14 calculators) and a **My estimates** tab (several jobs per device, Workshop job-file import). `estivite-v1-2.html` is the self-contained web build (`?lang=en|fr`); `estivite.html` is a copy of it; `estivite-v1-1.html` is kept for old links. Homepage blocks link to v1-2. Source: `Documents\Codex\2026-10-30\sn\outputs\trade-builder` (web) and `sn\work\estivite-android` (Android, versionCode 3 / 1.2.0, build with `node sn\work\build-estivite-1.2.cjs`). Update the "Android 1.1.0" line on both homepages once 1.2.0 is live for testers.

## Sac-à-Do (added 2026-10-30)

Trip and packing planner, formerly "Amber & Sage Outbound" (that name is retired). `sac-a-do.html` is the self-contained web version (10 languages; `?lang=en|fr|…` picks the language for that visit), `sac-a-do-privacy.html` is its bilingual privacy page (also the Play listing privacy URL). Homepage and `fr/index.html` have a `#sac-a-do` block in the Software section, edited directly in both files (like Estivite, not through `tools/i18n`). Android app id `com.doubleperspective.sacado`, 0.4.0 (versionCode 1) is on the internal testing track. Source lives outside this repo (`Documents\Codex\2026-10-18\wha\outputs\sac-a-do-0.4.0`).

## Zenith & Zero rename (2026-10-29)

The puzzle collection is officially **Zenith & Zero** (Sudoku, Solitaire, Word Search, Crossword, Mahjong). The name Amber & Sage is retired: `amber-sage.html` and `fr/amber-sage.html` are only redirects to `zenith-zero-sudoku.html` for old links; never link to them. Sudoku page images are `zenith-zero-sudoku-*.webp` (game 1.6.0, navy/cream/gold), share image `zenith-zero-sudoku-share.jpg`. Play app ids follow `com.doubleperspective.zenithzero.<game>` (+ `.pro`). Internal save keys inside the browser games (`ambersage.run`, `amber-sage-solitaire-v1`, `amber-sage-mahjong.v1`) are left as they are so web players keep their progress; they are never shown.

## Pages

| File | Page | State |
|---|---|---|
| `index.html` | Studio homepage | Done. Teasers for both games. |
| `umbral-purge.html` | Umbral Purge game page | Done. Worlds, 6 classes, features, v1.30.2 screenshot gallery. |
| `zenith-zero-sudoku.html` (+ `zenith-zero-sudoku.css`) | Zenith & Zero Sudoku page | New today. Linked from homepage, game page and footers. |
| `privacy.html` | Privacy policy | Updated 2026-10-17 for both games (EN + FR). |
| `support.html` | Support/contact | Done. |

Shared styles are in `style.css`. Fonts: `lexend.woff` (Zenith & Zero page).

## Recent work (newest first)

1. Added the Zenith & Zero Sudoku page with its own calm styling, screenshots and share image, and linked it across the site.
2. Uploaded the real Umbral Purge v1.30.2 screenshots and the title screen capture.
3. Header now explains the two Umbral Purge editions: **Free with ads** and **Premium, one-time purchase, no ads**.
4. Before that: dedicated Umbral Purge page, homepage simplified to a short teaser, rebrand to the gold compass / sunset / blue fantasy look.

## Open items / next steps

1. **Privacy policy (updated 2026-10-17).** Now covers Zenith & Zero Sudoku (free + Pro), Umbral Purge (free + premium) and the website, in English and French. It names Google AdMob for the free editions, with the data types from Google's AdMob Play disclosure guide, and matches the Zenith & Zero Data safety answers. **Still to confirm:** that the final Umbral Purge Android build uses AdMob the same way (if it uses another ad or analytics SDK, add it here). This page's URL is the privacy link for both Play listings: https://doubleperspective.github.io/Double-Perspective/privacy.html
2. **Store links.** No Google Play links yet. Both pages say release date TBA / coming soon. Add the links and release dates when the listings go live.
3. **Children's privacy / target audience:** the policy now says the games are for a general audience, not directed to children under 13. Zenith & Zero uses Play target audience 13+. Confirm the same for Umbral Purge.
5. **app-ads.txt:** AdMob looks for it at the root of the developer website domain. This site lives under `/Double-Perspective/`, so it will need a user-site repo named `doubleperspective.github.io` (served at https://doubleperspective.github.io/app-ads.txt) or a custom domain after launch.
4. Optional: the screenshot gallery on `umbral-purge.html` still contains the "Image awaiting upload" placeholder blocks. They are hidden automatically once the image loads, so they only appear if an image file goes missing.

## Conventions

- Keep the site static: no frameworks, no build tools, no tracking scripts.
- Images are `.webp` where possible; share images (`*-share.jpg`, `kc-share.jpg`) are used for link previews via `og:image`.
- Use full `https://doubleperspective.github.io/Double-Perspective/...` URLs in `og:image` tags; relative paths everywhere else.

## Languages (added 2026-10-26)

The site is bilingual. English pages are at the root, French copies at `fr/` (same file names). `lang.js` opens each page in the visitor's language: an explicit choice from the language menu (globe button) is remembered, otherwise the browser's preferred language decides (default English). The privacy policy is built from `tools/i18n/privacy.en.html` and `privacy.fr.html` (edit those, not the page). The contact address used on every page comes from `tools/i18n/email.txt`.

To update French after editing an English page: run `python3 tools/i18n/extract.py /tmp/pages.json /tmp/en.tsv`, compare with `tools/i18n/en.tsv`, add new lines to `tools/i18n/fr.tsv` with the same numbers, then run `python3 tools/i18n/build.py .` from the repo root.
