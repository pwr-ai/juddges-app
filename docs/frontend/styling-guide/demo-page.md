# Style Demo Page (Archived)

**Status:** Retired in August 2026.

The former guide described an internal component showcase, automatic source
extraction helpers, and a runtime API that returned component source files.
Those features no longer exist. The source-reading endpoint was deliberately
removed from the production route tree and must not be recreated.

## Current workflow

1. Follow the canonical [Editorial Jurisprudence design
   specification](../../reference/DESIGN.md).
2. Reuse primitives exported from `frontend/components/editorial/` for new
   product surfaces.
3. Exercise a component in the real route that consumes it and add focused
   component or route tests there.
4. Run `npm run validate`, `npm run typecheck`, and the relevant Jest suite.

Component documentation must use checked-in examples or tests. It must never
read arbitrary repository files through a runtime HTTP endpoint.

The historical implementation instructions were removed because following them
would point to deleted modules and reintroduce an unsafe production capability.
