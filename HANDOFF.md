# Handoff: Double Perspective website (formerly Kindred Compass Games)

Status as of **2026-11-13**. Written so a new Claude session (or person) can pick up where the last one stopped. Read this first, then `README.md`.

## Hosting moved to doubleperspective.com (2026-11-26)

- Domain registered at Network Solutions (paid to Nov 2029), DNS on Cloudflare (free plan).
- Cloudflare Pages project `double-perspective` deploys `main`; build `sh tools/cf-build.sh` → `dist/` (keeps `tools/`, notes and dotfiles off the public site).
- All absolute URLs (`og:image`, canonical, `tools/i18n/build.py` SITE) now use `https://doubleperspective.com/`.
- `app-ads.txt` is now in this repo, served at https://doubleperspective.com/app-ads.txt. The `doubleperspective.github.io` repo copy can go once AdMob reads the new one.
- GitHub Pages stays enabled for old Play privacy links until every listing points to https://doubleperspective.com/privacy.html.

## What this repo is

The **studio website** only: a static site hosted on GitHub Pages with no build step. Edit the HTML/CSS directly and push to `main` to publish.

- Live site: https://doubleperspective.com/
- Contact/support address used on the site: doubleperspective.contact@gmail.com

**The game source code is not in this repo.** Umbral Purge and Zenith & Zero Sudoku live somewhere else (on the developer's computer or in other Claude chats/projects). A session continuing game work needs those files uploaded or another repo connected.

## Zenith & Zero refresh (2026-11-13)

- `zenith-zero.html` and `fr/zenith-zero.html` (edited directly, not through `tools/i18n`): new screenshots from the current Android test builds (Solitaire 2.2.24, Sudoku 2.2.23, Word Search 2.3.25, Crossword 2.3.25, Mahjong 2.3.25, Nonograms 1.3.24, Cribbage 1.1.30) in `assets/gameplay/2026-11/` (`<game>-board.webp` for the cards, `<game>-phone.webp` for Enlarge, `-fr` versions for the French page), the new app icons in `assets/icons/<game>-128.png`, an "On your phone" gallery (themes, backgrounds, card designs, victory screen) and corrected facts (8 Mahjong layouts, 63 Nonograms pictures, 1-2 Cribbage opponents and peg colours, pinch to zoom). Extra styles in `zenith-zero.refresh.css`. The old `assets/gameplay/*.png` files are no longer used by these pages.
- `zenith-zero-sudoku*.webp` replaced with current screens (same file names, now 600x1301); themes are Ivory, Sage and Midnight.
- Homepage status: "In testing on Android · coming to Google Play".
- GPS app downloads (27 Nov): `gps/terrain.json` is the catalog of optional map extras the Gravel & Pavement Scout app downloads (trails now, terrain shading per province once its build finishes). The files live on GitHub prereleases (`trails-*`, `terrain-*`); regenerate the JSON with `python3 tools/terrain/site_catalog.py <terrain-tag> <terrain-catalog.json> <trails-tag> <trails-catalog.json> > gps/terrain.json` (`-` `-` for no terrain).
- Privacy policy (26 Nov): Gravel & Pavement Scout section (on-device location, map-pack downloads from maps.doubleperspective.com), hosting now Cloudflare; `tools/i18n/privacy.*.html` were resynced from the live pages, which had newer Lirecho sections.
- Privacy policy (13 Nov): "Free with ads" instead of "small banner ad", records mentioned under saves. `tools/i18n/privacy.en.html` / `privacy.fr.html` were out of date (October text) and now match the live pages again. Note: `tools/i18n/en.tsv` / `fr.tsv` are out of date for the homepage and Sudoku page, which have been edited directly since October; don't run `build.py` over them without re-extracting first.
- The October browser copies of the games (`games/`) were removed on 15 Nov 2026; nothing linked to them. Website names now follow the store titles ("Sudoku: Zenith & Zero", French "Sudoku : Zenith & Zero"); the support page lists all seven Zenith & Zero games and says Umbral Purge is coming to Steam.

## Content refresh (2026-11-07)

- **Umbral Purge is Steam-only for now** (PC and Steam Deck, owner's decision 2026-11-06). The game page and homepage say "Coming to Steam", with no ads and no microtransactions; the old Android/reward-video wording is gone. The five world cards use the in-game village names (the Meadow, Saffron Crossing, Frostmere, Cinderwake, the Umbral Capital). The strip above them is `umbral-purge-worlds.webp` (EN) and `umbral-purge-worlds-fr.webp` (FR, French captions): 1920×556, one landscape capture per village from the 1.58 browser build (1280×800, mid-siege, cropped to 4:5). The v1.30.2 phone screenshots in the gallery are still old.
- **Zenith & Zero has seven games** (Cribbage added): homepage text, studio paragraph and meta descriptions updated. Cribbage now says "in testing" like Nonograms.
- Edited directly in the EN and FR pages.

## Privacy policy rewrite (2026-11-07)

`privacy.html` and `fr/privacy.html` are one short policy for everything: Zenith & Zero (7 games incl. Cribbage), Lirecho, Umbral Purge, Estivite, Sac-à-Do and the site. Owner's rule: collect nothing; games with ads send only Google's minimum. Ads are **non-personalized** (AdMob `npa=1`) and the apps remove the AD_ID, ad-services Topics and attribution permissions (`Documents\Codex\zz-2.2\zz-privacy.ps1`, applied by the Zenith & Zero build scripts). Test builds up to 2026-11-07 (Z&Z 2.1, Cribbage 1.1.1, Umbral Purge 1.55) still use the standard settings, and the policy says so; drop that sentence once those are replaced. Umbral Purge is PC/Steam only now (owner, 2026-11-07); the policy lists it without ads and only mentions the old Android test build in the test-versions sentence. The in-app copies (`localization/privacy-en.html`, `privacy-fr.html`) carry the same text. `estivite-privacy.html` and `sac-a-do-privacy.html` describe the Android apps only (no internet permission, backup off); their former browser demos were removed on 17 Nov 2026.

## Ice Camp and Cabane Chaos: not on the site (owner's decision, 2026-11-07)

The owner doesn't want the ice-fishing game (Ice Camp) or the sugar-shack game (Cabane Chaos) on the website or in the privacy policy yet. The homepage block, footer link and policy sections were removed. The GitHub prereleases `ice-camp-v0.20.0` / `ice-camp-v0.21.0` and the `.icecamp-*` CSS are still in the repo. When they go public, add a block to index.html and fr/index.html and a "Playing together" section to the policy (players see the name; the host receives the IP address).

## Estivite 1.2 (added 2026-10-31)

Estivite retains its homepage software information and Android internal-test details. Its public browser-demo files and homepage demo link were removed on 17 Nov 2026.
Sac-à-Do retains its homepage software information and Android internal-test details. Its public browser-demo file and homepage demo link were removed on 17 Nov 2026. Android app id `com.doubleperspective.sacado`, 0.4.0 (versionCode 1), remains on the internal testing track.
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
