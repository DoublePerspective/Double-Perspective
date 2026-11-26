# Kindred Compass Games

Static studio website (Double Perspective). Hosted on Cloudflare Pages at https://doubleperspective.com/; the build only copies files (`sh tools/cf-build.sh`).

## Publishing

Hosted on Cloudflare Pages (project `double-perspective`), which deploys every push to `main`.
Build command `sh tools/cf-build.sh`, output directory `dist`: the script copies the public site and leaves out `tools/`, `README.md`, `HANDOFF.md` and dotfiles.

Workers in this repo (each deployed by Workers Builds on push, root directory = its folder; none are part of the Pages site):

- `admin/` → `dp-admin`, https://admin.doubleperspective.com (owner only, through Cloudflare One/WARP): usage limits, map packs, site edits.
- `maps/` → `dp-maps`, https://maps.doubleperspective.com: public map-pack downloads from the private R2 bucket.
- `follow/` → `dp-follow`, https://follow.doubleperspective.com: Gravel & Pavement Scout check-ins and follower alerts, D1 `dp-follow`. API: `follow/FOLLOW_API.md`.

Site: https://doubleperspective.com/ (also `www.`). The old GitHub Pages copy at https://doubleperspective.github.io/Double-Perspective/ stays on so existing Play Store privacy links keep working; its pages point search engines to doubleperspective.com.

## Before Google Play release

The privacy policy is a draft. Verify all data collection, SDKs, advertising, and Data safety declarations against the final Android app. Add actual game screenshots and store links once available.

Support: doubleperspective.contact@gmail.com (support@doubleperspective.com forwards there)
