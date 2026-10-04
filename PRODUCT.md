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
- New accounts must accept the current terms and privacy notice and self-confirm the applicable minimum age; acceptance is versioned and enforced for account actions through Firestore rules.
- Legal documents are an initial Peru-focused draft for review, not a guarantee of liability protection or global legal compliance. Complete operator/contact details and obtain legal review before public launch.
- The project is intended to remain on Firebase Spark for current testing. It does not use Firebase Storage or Cloud Functions.
- The streaming overlay must work as a transparent browser source and must not require a native plugin.
- Predictions selected for the overlay remain public, as do other published predictions.
- The current test stage offers every available overlay format for free.
- Paid access and subscription enforcement are not active.

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
