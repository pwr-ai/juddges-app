# prod-v1.5.50

> Release Notes for Version prod-v1.5.50

_Generated on 2026-11-27 from `prod-v1.5.49..HEAD` (20 commits)._

## Summary
This release includes several accessibility improvements, enhancements to navigation, and updates to project publications. Users will benefit from a more streamlined experience, particularly for signed-in users and guests.

## Highlights
- Improved accessibility features across the application.
- Enhanced navigation for both signed-in users and guests.
- Updated project publication visibility.

## Accessibility Improvements
- Named the mobile sidebar trigger for better clarity.
- Translated guest navigation labels to improve user experience.
- Corrected heading levels to ensure proper outline structure.
- Exposed main landmarks for better accessibility compliance.
- Transformed help quick-link cards into functional links.
- Made schema cards title links without interactive wrappers.

## Navigation Enhancements
- Updated footer links for signed-in users, ensuring guests see appropriate navigation options.
- Wrapped footer links for better responsiveness at smaller screen sizes.

## Project Publications Update
- Displayed verified project publications while removing unrelated bibliography entries.

## Testing and Quality Assurance
- Added various accessibility tests to ensure compliance and improve user experience.

## Source Commits
- `b8e1549d` fix(footer): link /changelog for signed-in users now the guest nav no longer does
- `6633b923` test(navbar): render real EN strings and cover the guest public-pages nav
- `55cc1d03` fix(a11y): name the mobile sidebar trigger after the drawer it opens
- `ad0ac9b2` fix(a11y): translate the guest nav label and offer only public pages to guests
- `4636ade1` test(route-contract): stub /health/status as unavailable for the status a11y spec
- `ab581392` fix(a11y): keep the System Status h1 in the error and loading states
- `02e7a749` test(a11y): retry axe until entrance fades settle instead of a fixed sleep
- `8b94751f` test(a11y): add axe landmark and contrast route-contract spec
- `b4222d8f` fix(footer): wrap links at 375px and hide gated links for guests
- `0f8015b7` fix(a11y): expose sidebar, banner and single main landmarks
- `f51c2a10` fix(a11y): add text-safe gold token for text colour
- `c1e81c42` chore(claude): enable the supabase plugin for project sessions
- `20aa7c0a` test(a11y): add heading-order helper tests and axe route-contract spec
- `dc4b1388` fix(a11y): correct heading levels so outlines never skip a level
- `a9b2e11e` fix(a11y): turn help quick-link cards into real links
- `78aa57ec` fix(a11y): make schema cards a title link without interactive wrapper
- `0651fdc0` fix(a11y): name collections sort select and make cards non-nested links
- `0c4590e6` fix(publications): show verified project publications, drop unrelated bibliography
- `1ec9e6f6` docs(schemas): add measured candidate volumes for topic schemas
- `d43f951a` feat(schemas): add 10 topic extraction schemas with collection queries
