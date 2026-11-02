# Cart and reservation fixes — 1.3.1

- Group Pre-Order is inside the reservation card, with a separate Invite guests action. Cancel uses a bordered danger style. Cancelled reservations no longer show group actions.
- Cart additions are serialized; successful writes within the queue are retained so delayed list-index responses cannot overwrite the previous addition. Errors reach the caller and the queue continues.
- Guest additions are queued rather than silently discarded while another request is pending. Guest line prices include quantity.
- The cart pulses briefly after successful additions and displays Review cart. Opening it acknowledges the hint. Reduced-motion preferences disable animation.
- Quantity controls have aligned buttons and tabular numerals. Cart mutations lock controls until save/refresh completes; local quantities and totals update together, refresh errors are visible, and stale refresh requests are cancelled.
- Add dish and Make Pre-Order keep the reservation context. Each draft total is labelled Reservation total.
- The confirmation modal fits desktop/mobile widths and shows an invitation field after editing a group booking. An invitation can also be reopened from the card. Missing groups are created when a reservation originally for one person now needs an invitation.
- The decorative arrow next to Open full page is removed.

Validation: app/spec TypeScript checks pass; production build passes (663.27 kB initial bundle). 104 targeted frontend tests pass. Full frontend suite: 317 tests, 272 pass, 45 existing failures; no new failures compared with the previous baseline. Backend: 170/170 tests pass. No new dependencies; package-lock changes only the application version.

The changes and regression tests were implemented with AI assistance.
