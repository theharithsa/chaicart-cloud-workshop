# ChaiCart Cloud Workshop

A two-day, game-based workshop on **cloud computing and business systems** for engineering students. Participants become the founders of *ChaiCart*, a 10-minute chai delivery startup. On Day 1 they build it in the cloud; on Day 2 they keep it alive through outages, bill shocks and a murder mystery.

**Live site:** https://theharithsa.github.io/chaicart-cloud-workshop/

The workshop materials are plain HTML, CSS and JavaScript and work offline. The companion [ChaiCart demo app](chaicart-demo/README.md) has a Node.js backend and requires a running server.

**ChaiCart app on Azure:** [Order chai or coffee](https://chaicart-workshop-vh-20261003.azurewebsites.net/) · [Facilitator console](https://chaicart-workshop-vh-20261003.azurewebsites.net/facilitator). Google sign-in is required; facilitator controls use the shared Firebase admin list. [Azure setup and redeployment instructions](chaicart-demo/docs/DEPLOYMENT.md#workshop-azure-environment).

---

## Understand the project

Start with the [illustrated project guide](https://theharithsa.github.io/chaicart-cloud-workshop/project-explained.html) for the three sites, people, activity handoffs, data boundaries and code map. Use the [workshop flow map](workshop-flow.html) while running the room. The reusable [Ian Xiaohei illustration skill](skills/README.md) is bundled for future projects.

## At a glance

| | |
|---|---|
| **Audience** | Engineering students (designed for 120 students from 5th and 7th semester) |
| **Format** | 24 teams of 5, grouped into 4 regions of 6 teams |
| **Duration** | 2 days, 09:30–17:00 |
| **Style** | Games, role-play and live demos rather than lectures |
| **Tools shown live** | Microsoft Azure (free tier and Basic plan) and Dynatrace |

## What's inside

### Present

| File | Purpose |
|---|---|
| [`index.html`](index.html) | Hub page linking every resource, with run-of-show and supplies |
| [`facilitator-guide.html`](facilitator-guide.html) | Printable guide: setup, printing quantities, region captains, scoring, and a step-by-step script for every stage |
| [`day1-slides.html`](day1-slides.html) | Day 1 deck (47 slides): *Build ChaiCart* |
| [`day2-slides.html`](day2-slides.html) | Day 2 deck (51 slides): *Keep ChaiCart Alive* |
| [`leaderboard.html`](leaderboard.html) | Legacy practice/reference scoring stored in the browser; use ChaiCart Live for official credits |
| [`quiz.html`](quiz.html) | Reference quizzes for preparation; run scored quizzes from ChaiCart Live |

### Print

| File | Purpose |
|---|---|
| [`cards.html`](cards.html) | Table tents and all card decks: timeline, service models, scenarios, Shark Tank, architecture, kitchen, bingo, error budget, bill shock, business systems, career tarot |
| [`murder-mystery.html`](murder-mystery.html) | *Who Killed Checkout?* evidence pack: metrics, logs, traces, change log, witnesses, accusation form and solution |
| [`treasure-hunt.html`](treasure-hunt.html) | Hands-on observability worksheet for Dynatrace and Azure |
| [`gallery-posters.html`](gallery-posters.html) | Six industry case-study posters |
| [`team-sheet-and-surveys.html`](team-sheet-and-surveys.html) | Team sheet, postmortem template, quiz answer sheets, 90-day plan, pre- and post-surveys |
| [`cheat-sheet.html`](cheat-sheet.html) | Two-page take-home summary |
| [`certificate.html`](certificate.html) | Participation and award certificates with bulk name entry |

## Agenda

**Day 1 — Cloud Computing Fundamentals and Industry Practices**
Introduction and evolution · IaaS, PaaS, SaaS · public, private, hybrid and multi-cloud · major platforms · virtualization and containers · cloud architecture · cloud-native and microservices · industry use cases · introduction to observability

**Day 2 — Cloud Operations, Observability and Business Systems**
Performance and reliability · monitoring, observability and APM · logs, metrics and traces · SRE · DevOps and CI/CD · security, scalability and cost · business systems in the cloud · the role of cloud in digital business · trends, careers and skills · case studies and Q&A

## Networking icebreakers

Three short activities build a peer network across three sessions: LinkedIn in the Day 1 opening, GitHub after lunch on Day 1, and X launched in the Day 2 opening and continuing throughout the day. Both decks have a day-specific agenda and local QR codes for the presenter’s profiles. Each activity awards **100 Cloud Credits per team**, once, for a maximum of **300**. Existing profiles, connections and follows count. If signup is delayed, draft the profile first and complete setup during a break; captains record completed activities. Captains use the networking score grid and enter separate leaderboard rounds. The **Best Workshop Post or Photo** award goes to one individual at closing, judged on learning value, creativity and workshop spirit rather than likes. Submit your best post link to your captain before the final awards. This award is separate from team credits. Optional X posts and workshop photos should include **#ChaiCartCloudWorkshop**; browse them using [the workshop hashtag search](https://x.com/search?q=%23ChaiCartCloudWorkshop&src=typed_query&f=live).

## Using the materials

### Presenting

Open `index.html` (or the live site) in Chrome, Edge or Firefox.

| Key | Action |
|---|---|
| `→` / `Space` | Next item or slide |
| `←` | Back |
| `F` | Full screen |
| `Home` / `End` | First / last slide |
| `P` | Presentation mode (leaderboard) |
| `R` / `T` | Reveal answer / start timer (quiz) |

Add `#N` to a deck's address to jump to slide N, for example `day2-slides.html#11`.

Use [ChaiCart Live](https://chaicloud-workshop.web.app/) as the paperless student workspace and canonical live leaderboard. Its [README](https://github.com/theharithsa/chaicart-live#readme) explains Google sign-in, captain reviews and recovery. The standalone leaderboard is an optional legacy tool that stores scores only in its browser.

### Printing

Print from Chrome or Edge on **A4, 100% scale, with "Background graphics" enabled**. Printing is optional. The facilitator guide now describes the paperless app workflow; the printable decks remain reference resources.

### Running locally

No server is required: open `index.html` directly. To serve it locally instead:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## ChaiCart demo app

The companion app lives in [`chaicart-demo/`](chaicart-demo/README.md). It includes a storefront, cart, simulated checkout and delivery, plus a protected facilitator console for pool exhaustion, gateway outages, ERP queue replay, metrics, logs and trace waterfalls.

```bash
cd chaicart-demo
npm ci
npm test
export AUTH_MODE="local-token"
export ADMIN_TOKEN="choose-a-local-demo-token"
npm start
```

Open `http://localhost:8080`; the console is at `/facilitator`. This quick start uses the explicit local-token fallback. For deployed Google sign-in using the live app's admin list, follow [Firebase authentication setup](chaicart-demo/docs/AUTHENTICATION.md). See the [app README](chaicart-demo/README.md) for complete setup, [facilitator runbook](chaicart-demo/docs/FACILITATOR.md) for the live-demo sequence, and [deployment notes](chaicart-demo/docs/DEPLOYMENT.md) for Azure versus Firebase.

The materials stay hosted on GitHub Pages. The backend must run on a compute service such as Azure App Service or Cloud Run. App tests run through [the demo workflow](.github/workflows/chaicart-demo.yml); Azure deployment stays disabled until `AZURE_WEBAPP_NAME` and the deployment secret are configured.

## Customising

| To change | Edit |
|---|---|
| Team and region names | `REGIONS` in `leaderboard.html` and the `regions` list in the table-tent block of `cards.html` |
| Card content | The `decks` array in `cards.html` |
| Quiz questions | The `sets` object in `quiz.html` |
| Colours and typography | `assets/deck.css` (slides) and `assets/print.css` (printables) |

## Deployment

The site deploys to GitHub Pages automatically on every push to `main` through [`.github/workflows/pages.yml`](.github/workflows/pages.yml). In the repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.

## License

Released under the [MIT License](LICENSE).

## Observability

See [observability.md](observability.md) for the complete RUM and OpenTelemetry runbook covering the workshop Pages, Azure ChaiCart Demo and Firebase ChaiCart Live.

## Workshop flow at a glance

Open [Workshop Flow Map](workshop-flow.html) for the three-site map and all 34 operating steps across both days. Each activity shows facilitator launch, student submission, app behavior, captain review and facilitator scoring. The full [facilitator guide](facilitator-guide.html) includes a five-minute operating reference; `facilitator.html` redirects there.
