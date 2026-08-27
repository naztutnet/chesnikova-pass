# Visitor management: experience audit

## Scope

- Product shape: subscription visitor-management products plus selected mobile/admin references.
- User: employee or coordinator creating guest visits; reception/security validating them.
- Primary task: pre-register a visitor, supply required details, confirm submission, track status.
- Sources reviewed: [Envoy Visitors](https://envoy.com/products/visitors), [Sign In App](https://signinapp.com/visitor-management), [Vizitor](https://www.vizitorapp.com/visitor-management-system/), [Greetly](https://www.greetly.com/features/visitor-management-system), [Eptura Visitor](https://eptura.com/proxyclick/), [VisitorOS](https://help.facilityos.com/hc/en-us/articles/19132701922971-Using-the-VisitorOS-Dashboard), [MangoApps Guest Pass](https://www.mangoapps.com/directory/app/guest-pass), and visual concepts from [Behance](https://www.behance.net/gallery/168940935/Visitor-Management-System), [Dribbble](https://dribbble.com/shots/14640747-Visitor-Management-App-Design), and [Pinterest](https://in.pinterest.com/khanrahil723/visitor-pass/).
- Evidence quality: Envoy, Sign In App and Vizitor were inspected as rendered mobile pages; Greetly and Eptura were assessed from current official page content because the rendered pages did not load reliably. Concept sites are inspiration, not product evidence.

## Comparison table

| Dimension | Pattern observed | Implication for CHESNIKOVA PASS |
|---|---|---|
| Primary task | Invite/pre-register/check in is the leading action | Keep “Новая заявка” visually dominant |
| Information density | Product marketing is airy; working dashboards use compact lists and statuses | Dense mobile list, minimal hero statistics |
| Navigation | Activity/visitors, create, and account/settings recur | Three destinations are sufficient for v1 |
| Workflow | Visit details → people → review/verification | Preserve the existing three-step master |
| Trust | Real-time state, audit log, badges/QR, compliance messaging | Show verified PassOffice ID and status, not just a success animation |
| Brand register | One sans family, light surface, one strong accent | One Cyrillic-capable sans throughout; cobalt only for action/state |

## Recurring patterns

1. A clear create/invite action appears before secondary analytics.
2. Operational work is organised by time and state: expected, signed in, pending, completed.
3. Visitor rows surface name, destination/time, and status without opening detail.
4. Pre-registration and on-site check-in are distinct paths.
5. Confirmation, host notification, and auditability are core trust signals.

## Gaps and opportunity

- Marketing pages over-emphasise KPI cards and feature grids; they are weak references for an employee Mini App.
- Many desktop examples rely on sidebars, wide tables, and charts that do not transfer to Telegram.
- Ticket/boarding-pass references are useful after approval, when a QR credential exists, but they make the application form feel decorative and ambiguous.
- The strongest opportunity is a coordinator-first mobile workflow: immediate creation, compact status list, draft recovery, and a verified external-system result.

## Experience bar

CHESNIKOVA PASS should be the fastest reliable way for a coordinator to create and verify a guest pass from Telegram. It should feel calmer and denser than product-marketing examples, while retaining the category’s familiar sequence and status language.

## Decisions

- Remove the standalone logo mark and large decorative signal graphic.
- Use `CHESNIKOVA PASS` as a compact wordmark only.
- Use one type family across headings, fields, buttons, and status labels.
- Keep one cobalt accent and neutral operational surfaces.
- Keep the three-step application flow; reduce spacing while preserving 44 px touch targets.
