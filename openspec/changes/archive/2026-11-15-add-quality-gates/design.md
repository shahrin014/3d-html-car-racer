# Design: quality gates

## Browser tests run the shipped artifact

Playwright starts `vite preview` after `npm run build`, so the suite exercises
the same hashed bundles, stamped service worker, and manifest that Pages
publishes. Testing the dev server would miss the build pipeline entirely.

WebGL is available in headless Chromium through SwiftShader, so no GPU runner is
needed. Service workers are blocked by default to keep tests deterministic; the
single offline spec opts in and asserts the cache is populated before going
offline.

## Deterministic gameplay assertions

Traffic placement is random, but a run always seeds a car in the left lane. The
collision smoke test therefore steers left and waits for a guaranteed hit rather
than waiting on a random wave. Lane position is mirrored to `data-lane` on the
stage element by `src/main.ts`; the simulation still does not read the DOM, and
the attribute is not part of the visual design.

## Budget measured where it matters

Vite's chunk warning reports uncompressed bytes, so it fires on a bundle that is
well inside the gzip budget and cannot be satisfied without shipping the same
payload as more requests. The build instead measures gzip size of every emitted
script and fails above 250 KB. The warning limit is raised to 600 kB as a
headroom alarm, documented in `vite.config.ts`.

## Cache version derived from the build

Hashing the path and content of every emitted file means:

- an unchanged rebuild keeps the same cache name, so clients do not redownload;
- any change to the app shell, `CORE_ASSETS`, or the service worker itself
  produces a new cache name, and the activate handler deletes the old one.

Stamping happens in `closeBundle`, after Vite has copied `public/sw.js` into
`dist/`. The source file keeps a placeholder, and stamping throws if the
placeholder is missing, so the automation cannot silently regress.

## Workflow split

`ci.yml` runs for pull requests only, with `contents: read`. Pushes to `main` are
covered by the deployment workflow, which now runs the browser job in parallel
with the build and requires both before deploying. This avoids paying for the
same checks twice on a merge.
