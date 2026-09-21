# prod-v1.5.10

> Release Notes for Version prod-v1.5.10

_Generated on 2026-09-16 from `prod-v1.5.9..HEAD` (28 commits)._

## Summary
This release includes various enhancements and fixes aimed at improving the user interface and editorial experience. Key updates focus on design consistency, dashboard functionality, and overall usability improvements.

## Highlights
- Improved sidebar layout to prevent footer overlap
- Enhanced editorial design with updated color schemes
- New features added to the dashboard for better research workflow management

## User Interface Improvements
- Fixed sidebar overlay issue that covered the footer
- Dropped faux italic styles and outdated colors for PWr identity
- Updated design elements to remove glass styles from buttons and cards
- Adjusted color contrasts for better visibility in editorial components

## Dashboard Enhancements
- Isolated research activity for clearer visibility
- Introduced a new research workflow feature to streamline user tasks

## Design Updates
- Implemented editorial palette adjustments for charts
- Added new design patterns including red bar and square numerals
- Documented the PWr identity edition and its implementation plan

## Documentation Updates
- Corrected color specifications and wording in editorial documentation
- Added plans for AI-slop removal and PWr restyle implementation

## Source Commits
- `09bc248` fix(layout): stop the sidebar overlay from covering the footer
- `a10fc6b` test(charts): guard chart files against colour literals
- `1e9780b` refactor(charts): editorial palette for reasoning-line and judge charts
- `b18c3a3` fix(ui): drop faux italic and parchment-era colours for PWr identity
- `b73e595` chore(ui): post-merge nits from the #639 review
- `1611ce7` fix(dashboard): isolate research activity
- `6931eaa` refactor(ui): de-glass style primitives, ui buttons and cards
- `8ab527c` chore(design-sync): column card mode for four wide editorial previews
- `4dbf212` feat(dashboard): surface research workflow
- `4fb9652` fix(landing): drop faux italic on Tenor Sans display text
- `494005a` docs(editorial): correct top-mark colour and card-title wording
- `bf51ab6` fix(editorial): use black top mark and fix bar numeral contrast
- `a68bdf8` chore(ui): add banned-class ratchet to npm run validate
- `b1ab26d` chore(ui): delete dead pre-Editorial components and CSS
- `10b71c9` docs(plans): add AI-slop removal plan for Editorial migration
- `97a9cc2` fix(editorial): ChartFigure title follows the display-headline rule
- `b64f113` fix(design): SIW faculty red for danger, no faux italic on Tenor Sans
- `e2d482a` fix(design): keep emphasised words white inside the red bar
- `1ce64f5` chore(design-sync): PWr tokens, Tenor Sans and bar previews
- `caf331d` docs(design): correct EditorialCard flat and numeral wording
- `8a4b2eb` docs(design): document the PWr identity edition
- `9bf7c58` feat(editorial): red-bar masthead, square numerals, bar section header
- `ab00f28` feat(design): SIW patterns — red bar, red card rule, no paper grain
- `0598aa0` fix(editorial): correct Headline em docs for Tenor Sans
- `6b92eea` feat(design): switch display type to Tenor Sans
- `8c0bdc7` feat(design): add PWr token layer with editorial aliases
- `120e34f` docs(design): implementation plan for PWr restyle
- `e0da145` docs(design): spec for PWr restyle of the design system
