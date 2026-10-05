# Interface design and verification

The workshop has three distinct interfaces: this site teaches and guides the presenter, ChaiCart Live collects student work and credits, and the Azure demo demonstrates orders and recovery. The entry page provides separate student, captain and facilitator paths.

## Screen and print layouts

- Reference pages use `assets/screen.css` for readable screen layouts and `assets/reference.js` for section navigation, reference notices and bounded table scrolling. Printable A4 styling remains separate.
- Slides provide explicit previous/next controls, a slide picker, and reading/projector modes. Phones start in reading mode. The projector control rail sits outside the slide area.
- Static quiz and leaderboard pages are labeled as practice/reference tools. Official answers and scores belong in ChaiCart Live.
- The demo uses a responsive storefront, illustrated menu, mobile cart link, readable order history and grouped incident controls.

## Checks performed on 5 October 2026

- All 15 workshop HTML entry pages checked at 360, 390, 768 and 1280 px widths; no page overflow after fixes.
- All 98 slides checked at 1280 × 900 in projector mode; selected content stayed inside the slide and clear of the control rail.
- Reading-mode next/previous navigation and flow-map day/search/expand controls exercised in the browser.
- Local demo checkout, order history, tracking and authenticated control-room layouts rehearsed with local-only credentials and disposable orders.
- All 13 demo backend tests pass, including authorization, scenarios and telemetry encoding.

Protected Live screens were rehearsed with isolated synthetic local fixtures, not production workshop records. Live's verification is documented in its repository. Production Google account switching and real session participation were not repeated during this design release.

## Release scope

No Firestore rule, scoring algorithm, backend authorization or telemetry exporter changes are part of this design release. Publish the workshop site through GitHub Pages, Live through Firebase Hosting, and the demo to the existing Azure App Service. Exclude local fixtures, environment files, credentials and persisted orders from deployment artifacts.
