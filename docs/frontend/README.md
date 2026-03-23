# Frontend Documentation

## Overview

This directory contains comprehensive documentation for the Juddges App frontend, covering UX/UI design, testing strategies, and component implementation guides.

---

## Documents

### 1. UX/UI Review and Recommendations
**Archived** to `.context/ux-ui-review.md` (point-in-time audit from Feb 2026).

---

### 2. [TESTING_STRATEGY.md](./TESTING_STRATEGY.md)
**Complete testing implementation plan**

**Contents**:
- Unit testing guidelines with Jest + React Testing Library
- Integration testing patterns with MSW
- E2E testing with Playwright (authentication, search, chat flows)
- Accessibility testing (keyboard navigation, ARIA, WCAG compliance)
- Visual regression testing with screenshot comparisons
- CI/CD integration examples
- Testing metrics and coverage goals
- Quick start guide for developers

**Target Metrics**:
- Unit tests: 80%+ coverage
- E2E tests: 8 critical flows covered
- Accessibility: WCAG 2.1 AA compliance
- Performance: < 5 min full test suite

**When to Read**:
- Before writing tests for new features
- When setting up CI/CD pipelines
- During code review to ensure test coverage

---

### 3. [COMPONENT_IMPLEMENTATION_GUIDE.md](./COMPONENT_IMPLEMENTATION_GUIDE.md)
**Ready-to-use component templates**

**Contents**:
- **Loading States**: LoadingSpinner, SkeletonCard, FullPageLoader
- **Empty States**: EmptyState variants for search, chat, documents
- **Error States**: ErrorDisplay, NetworkError, NotFoundError
- **Search Components**: SearchBar, SearchFilters, SearchResults
- **Chat Components**: ChatInterface, ChatMessage, ChatInput
- **Judgment Components**: JudgmentCard
- **Data Table**: Full-featured DataTable with sorting, filtering, pagination
- **Command Palette**: Keyboard-driven navigation (Cmd+K)

**Key Features**:
- Production-ready TypeScript code
- Accessibility-first design (WCAG 2.1 AA)
- Mobile-responsive patterns
- Test-ready with data-testid attributes
- Consistent with Legal Glass 2.0 design

**When to Read**:
- When implementing new components
- When looking for component patterns
- During rapid prototyping

---

## Quick Start

### For New Developers

1. **Set Up Testing**
   ```bash
   # Install dependencies
   cd frontend
   npm install
   npx playwright install --with-deps

   # Run existing tests (if any)
   npm run test
   npm run test:e2e
   ```

3. **Implement Missing Components**
   ```bash
   # Copy component templates
   # See COMPONENT_IMPLEMENTATION_GUIDE.md for templates
   ```

4. **Write Tests**
   ```bash
   # Follow patterns in TESTING_STRATEGY.md
   # Create test files in tests/unit/ and tests/e2e/
   ```

---

## Priority Action Items

Based on the UX/UI review, here are the **immediate priorities**:

### Sprint 1 (Days 1-6): Core User Flows
**Status**: 🔴 Critical
**Owner**: Frontend Team

- [ ] Implement search flow components (SearchBar, SearchFilters, SearchResults)
- [ ] Implement chat flow components (ChatInterface, ChatMessage, ChatInput)
- [ ] Add loading/empty/error states to all flows
- [ ] Write E2E tests for search and chat flows

**Acceptance Criteria**:
- Users can search judgments and filter results
- Users can chat with AI and see streaming responses
- All states (loading, empty, error) display correctly
- E2E tests cover happy paths

### Sprint 2 (Days 7-12): Testing Infrastructure
**Status**: 🟡 High Priority
**Owner**: QA + Frontend Team

- [ ] Write unit tests for all UI components (Button, Card, Input, etc.)
- [ ] Write unit tests for contexts (AuthContext)
- [ ] Achieve 80%+ coverage for components/lib
- [ ] Set up CI/CD pipeline for automated testing

**Acceptance Criteria**:
- 80%+ unit test coverage
- All E2E tests passing in CI
- Coverage reports generated automatically

### Sprint 3 (Days 13-18): Component Documentation
**Status**: 🟢 Medium Priority
**Owner**: Frontend Team

- [ ] Set up Storybook
- [ ] Document all UI components with stories
- [ ] Add interaction tests in Storybook
- [ ] Create developer contribution guide

**Acceptance Criteria**:
- All components documented in Storybook
- Interactive examples for each component state
- Developer onboarding time reduced by 50%

---

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4 + Legal Glass 2.0 design system
- **Components**: Radix UI primitives (30+ components)
- **State Management**: Zustand (UI state) + React Query (server state)
- **Forms**: React Hook Form + Zod validation
- **Rich Text**: TipTap editor
- **Testing**: Jest + React Testing Library + Playwright

### Design System Highlights

**Legal Glass 2.0**:
- Sophisticated glassmorphism with backdrop blur
- OKLCH color space for perceptual uniformity
- Multi-brand support (Juddges, JuDDGES, Legal-AI)
- Comprehensive dark mode
- RTL language support

**Color Tokens**:
```css
--primary: oklch(0.55 0.22 200.00);     /* Juddges Teal */
--success: oklch(0.65 0.18 145.00);     /* Green */
--warning: oklch(0.75 0.15 85.00);      /* Amber */
--error: oklch(0.62 0.23 25.00);        /* Red */
```

**Typography Scale**:
- Display: 36px/40px - Hero headlines
- H1: 30px/36px - Page titles
- H2: 24px/32px - Section headers
- Body: 16px/24px - Default text
- Small: 14px/20px - Secondary text

---

## Development Workflow

### Before Committing
```bash
# Run linting
npm run lint

# Run unit tests
npm run test

# Check test coverage
npm run test:coverage
```

### Before Pushing
```bash
# Run E2E tests locally
npm run test:e2e

# Run specific E2E test suite
npm run test:e2e:chat
npm run test:e2e:search
```

### CI/CD Pipeline
```yaml
# Automated checks on PR
- Unit tests
- E2E tests
- Accessibility tests
- Bundle size analysis
- Code coverage upload
```

---

## Performance Benchmarks

### Current Estimates
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| First Contentful Paint | < 1.8s | TBD | 🟡 |
| Largest Contentful Paint | < 2.5s | TBD | 🟡 |
| Total Blocking Time | < 200ms | TBD | 🟡 |
| Bundle Size (initial) | < 500KB | ~1-2MB | 🔴 |

### Optimization Opportunities
1. **Code Splitting**: Lazy load heavy components (TipTap, charts)
2. **Tree Shaking**: Remove unused Radix UI components
3. **Image Optimization**: Use Next.js Image component
4. **Glassmorphism**: Simplify for mobile devices

---

## Accessibility Compliance

### WCAG 2.1 AA Requirements

**Current Status**: ⚠️ Partial Compliance

- ✅ **Color Contrast**: OKLCH ensures perceptual uniformity
- ✅ **Focus States**: Visible focus indicators on interactive elements
- ✅ **Radix UI**: Built-in ARIA support
- ❌ **Keyboard Navigation**: Not fully tested
- ❌ **Screen Reader**: No testing done
- ❌ **Form Labels**: Needs audit

**Action Required**:
1. Run axe-core accessibility audits
2. Test with screen readers (NVDA, JAWS, VoiceOver)
3. Verify keyboard navigation for all flows
4. Add skip navigation links

---

## Component Inventory

### Implemented (from package.json)
✅ Button, Card, Input, Dialog, Popover, Tooltip
✅ Select, Checkbox, Radio, Switch, Slider
✅ Table, ScrollArea, Tabs, NavigationMenu
✅ AuthContext, AuthenticatedLayout

### Missing (Critical)
❌ SearchBar, SearchFilters, SearchResults
❌ ChatInterface, ChatMessage, ChatInput
❌ LoadingSpinner, SkeletonCard, EmptyState
❌ ErrorDisplay, DataTable, CommandPalette
❌ DocumentViewer, Breadcrumbs

**See [COMPONENT_IMPLEMENTATION_GUIDE.md](./COMPONENT_IMPLEMENTATION_GUIDE.md) for templates.**

---

## Testing Coverage Goals

### Week-by-Week Targets

| Week | Unit Tests | Integration Tests | E2E Flows | Accessibility |
|------|-----------|------------------|-----------|---------------|
| Week 1 | 40% | 20% | 2 flows | 0 pages |
| Week 2 | 60% | 40% | 4 flows | 5 pages |
| Week 3 | 75% | 60% | 6 flows | 10 pages |
| Week 4 | 85% | 70% | 8 flows | All pages |

### Critical Flows to Cover
1. **Authentication Flow**: Login, logout, session management
2. **Search Flow**: Query input, filtering, pagination, results display
3. **Chat Flow**: Message sending, streaming responses, history
4. **Document Viewing**: Judgment detail, navigation, export
5. **Error Handling**: Network errors, API failures, invalid inputs

---

## Mobile-First Considerations

### Responsive Breakpoints
```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Mobile-Specific Concerns
- ⚠️ **Glassmorphism**: May be performance-intensive on mobile
- ⚠️ **Touch Targets**: Ensure minimum 44x44px
- ⚠️ **Sidebar**: Should become drawer/overlay on mobile
- ⚠️ **Forms**: Test with mobile keyboards

**Recommendation**: Test on actual devices, not just browser dev tools.

---

## Resources

### Internal Documentation
- [CLAUDE.md](../../CLAUDE.md) - Project-wide development guide
- [README.md](../../README.md) - Project overview and setup
- [SETUP_GUIDE.md](../../SETUP_GUIDE.md) - Detailed setup instructions

### External Resources
- [Next.js 15 Documentation](https://nextjs.org/docs)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind CSS](https://tailwindcss.com/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright](https://playwright.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Learning Resources
- [Next.js 15: App Router Guide](https://medium.com/@livenapps/next-js-15-app-router-a-complete-senior-level-guide-0554a2b820f7)
- [Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices)
- [Radix UI + Tailwind CSS Integration](https://tailwindcss-radix.vercel.app/)

---

## Contributing

### Adding New Components

1. **Create Component**
   ```bash
   touch components/feature/ComponentName.tsx
   ```

2. **Follow Component Template**
   - See [COMPONENT_IMPLEMENTATION_GUIDE.md](./COMPONENT_IMPLEMENTATION_GUIDE.md)
   - Use TypeScript strict mode
   - Add data-testid attributes
   - Include accessibility features

3. **Write Tests**
   ```bash
   touch tests/unit/components/feature/ComponentName.test.tsx
   ```

4. **Document in Storybook** (optional but recommended)
   ```bash
   touch components/feature/ComponentName.stories.tsx
   ```

### Code Review Checklist
- [ ] Component follows design system patterns
- [ ] TypeScript types are defined
- [ ] Accessibility features implemented (ARIA, keyboard nav)
- [ ] Unit tests written and passing
- [ ] Responsive design tested
- [ ] Dark mode tested
- [ ] Performance impact considered

---

## Maintenance

### Regular Tasks
- **Weekly**: Review and update component documentation
- **Bi-weekly**: Run accessibility audits
- **Monthly**: Review and optimize bundle size
- **Quarterly**: Update dependencies and test compatibility

### Monitoring
- Track Core Web Vitals in production
- Monitor error rates in Sentry/LogRocket
- Review test coverage trends
- Track page load performance

---

## Contact & Support

**Frontend Team Lead**: TBD
**QA Lead**: TBD

**Slack Channels**:
- #frontend-dev - General frontend discussions
- #ui-ux - Design system and UX discussions
- #testing - Testing strategies and support

**Office Hours**: TBD

---

## Changelog

### 2026-02-12 - Initial Documentation
- Created comprehensive UX/UI review
- Documented testing strategy
- Provided component implementation guide
- Established documentation structure

**Next Review**: After Sprint 1 completion

---

**Last Updated**: 2026-02-12
**Document Version**: 1.0
**Status**: Active
