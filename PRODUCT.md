# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Viewers who browse tipster profiles and public predictions.
- Tipsters who publish predictions and manage their public profiles.
- Streamers who want to show selected public predictions in streaming software.
- The platform creator who manually approves tipsters.

## Product Purpose

Fijas en vivo helps viewers discover tipsters, review their public predictions and results, and follow creators they trust. Tipsters can choose which of their predictions to feature on a live-stream overlay.

## Positioning

An open tipster directory built around manually approved publishers and public, attributable predictions.

## Operating Context

Tipsters manage profiles and predictions in a browser dashboard. A streamer can add a public browser-source URL to OBS or compatible streaming software and display selected predictions during a broadcast.

## Capabilities and Constraints

- The current application uses static HTML, Firebase Authentication, and Cloud Firestore.
- Tipster access is manually approved. Verified accounts own their profiles and predictions.
- Profiles and predictions are public in the current MVP.
- Viewers can register and sign in with email/password or Google, keep a local persistent session, and follow approved tipsters. Password recovery is available in viewer, tipster and owner access forms. Email registration requires legal consent and email verification. The Following feed combines real-time prediction queries in groups of at most 10 tipsters.
- Private viewer documents live in `users`; `follows` stores unique follower/tipster relationships. Each relationship change atomically updates the tipster's follower count, enforced by Firestore rules.
- New accounts must accept the current terms and privacy notice and self-confirm the applicable minimum age; acceptance is versioned and enforced for account actions through Firestore rules.
- Legal documents are an initial Peru-focused draft for review, not a guarantee of liability protection or global legal compliance. Complete operator/contact details and obtain legal review before public launch.
- The project is intended to remain on Firebase Spark for current testing. It does not use Firebase Storage or Cloud Functions.
- The streaming overlay must work as a transparent browser source and must not require a native plugin.
- Predictions selected for the overlay remain public, as do other published predictions.
- The current test stage offers every available overlay format for free.
- Paid access and subscription enforcement are not active.
- The viewer frontpage has a sticky glass navbar, a collapsible featured-tipster sidebar, and a live public feed of at most 60 recent predictions. Sports categories (Todos, Fútbol, Baloncesto, Tenis, E-Sports, Otros) filter predictions in Explore, Following and public profiles, not tipster specializations. Featured channels indicate connection to the platform, not a verified video broadcast. Public feed subscriptions reuse groups of at most 10 approved tipsters; adding sports is centralized in the frontpage SPORTS configuration, while new stored sport identifiers still require server-rule support.
- The viewer shell fills the viewport with independently scrolling channels, feed and community-chat demo columns on desktop. Below 901px, channels become a collapsible horizontal avatar rail and the chat opens in a native modal drawer. The chat is explicitly simulated locally, can be paused, holds at most 60 messages, does not write to Firebase and resets on reload; it is not a production community messaging service. Legal links remain inside the scrollable feed.
- All roles sign in through the frontpage using the shared Firebase Auth instance. The account dropdown watches effective permissions from `platformAdmins` and approved `perfiles`, never trusting `users.role`. Authorized dashboards mount natively in the central column without navigation or dashboard iframes; the navbar, feed DOM, filters and feed scroll remain intact. “Regresar al streaming”, browser history and live permission revocation unmount subscriptions and restore the viewer context. The tipster OBS preview is the only embedded iframe. The standalone dashboard URLs remain available; unauthenticated tipster entry returns to the unified login.
- Profile settings are a native central view available to every active account, with verified email required to save. `users/{uid}/settings/profile` privately stores the viewer display name, HTTPS avatar URL, short bio, Emerald/contrast theme and accessible chat announcement preference. These settings do not modify Auth identity, administrative authority or the tipster's editorial profile; there is no upload, push/email notification service or public viewer-profile directory. The navbar reflects saved settings in real time.
- Tipster performance KPIs cover the selected bankroll date period, not lifetime totals. Administrative registered-user totals count base viewer documents, including privileged accounts with modular permissions; the total is unavailable without the existing viewer-read permission. Community moderation and report persistence remain explicitly pending while chat is a local demo.
- New public picks use `event_date`, `sport`, `event`, `league`, `market`, `selection`, `odds`, `stake` (public units), `bookmaker`, `analysis` and `status` (`pending`, `won`, `lost`, `void`, `cashed_out`). `cashout_value` is gross returned public units, or `cashout_odds` is a gross-return/stake multiplier; neither represents private currency. Unit ROI/Yield weights actual settled stake, excludes void/pending and incomplete legacy returns; cashout is excluded from win rate. Private bankroll ROI continues to use the separately recorded monetary return and never infers it from public units.
- `pick-schema.js` adapts historical aliases at read time without modifying documents or inventing stake/return. Tipster history merges indexed canonical and legacy date queries; legacy date indexes must remain until an explicit migration. When an owner writes an eligible legacy document, it is replaced with the canonical public whitelist while retaining creation time and unchanged terms during settlement. Critical terms lock after event start; a pending result may be settled once even after start, then cannot be reopened. Historical missing league/market/stake stay empty/null on a result-only upgrade and are excluded from unit profitability as necessary. No automatic production migration or deployment occurs.

## Brand Commitments

- Product name: Fijas en vivo.
- Existing identity and interface copy are Spanish-language.

## Evidence on Hand

- The working implementation is in `index.html`, `admin.html`, and `owner.html`.
- Firebase configuration, Firestore rules, and indexes are in the project root.
- No user testimonials, performance claims, partnerships, or paid-plan commitments are established.

## Product Principles

- Make public prediction ownership and status clear.
- Let each tipster control which predictions appear in their stream.
- Keep publishing permissions enforced by Firestore, not just by interface visibility.
- Do not imply paid features or exclusive predictions before a trusted payment system exists.
