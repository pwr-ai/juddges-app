# Chat Sources Implementation Checklist

This checklist tracks the implementation progress for the chat sources/citations feature.

---

## Phase 1: Core Structure (Day 1)

### Type Definitions
- [x] Create `/types/chat-sources.ts`
- [ ] Update `/types/message.ts` to include `documentIds` field
- [ ] Add optional metadata field to Message interface

### Base Components
- [ ] Create `/components/chat/message-sources.tsx`
  - [ ] Basic component structure
  - [ ] Expand/collapse state management
  - [ ] Props interface implementation
- [ ] Create `/components/chat/source-card.tsx`
  - [ ] Card layout with all sections
  - [ ] Props interface implementation
  - [ ] Action handlers (view, save)
- [ ] Create `/components/chat/source-card-skeleton.tsx`
  - [ ] Skeleton screen for loading state
  - [ ] Pulse animation
- [ ] Create `/components/chat/document-type-icon.tsx`
  - [ ] Icon mapping for document types
  - [ ] Color coding implementation
  - [ ] Size variants

### Styling
- [ ] Add source-specific CSS classes to `globals.css`
- [ ] Verify document type colors are defined
- [ ] Add animations (slide-down, highlight-pulse)
- [ ] Test dark mode compatibility

---

## Phase 2: Data Integration (Day 2)

### API Layer
- [ ] Create `/lib/sources-api.ts`
  - [ ] `fetchDocumentsByIds()` function
  - [ ] Batch request handling
  - [ ] Error handling
- [ ] Create API endpoint `/api/documents/batch`
  - [ ] Accept array of document IDs
  - [ ] Return SearchDocument array
  - [ ] Handle not-found documents

### Hooks
- [ ] Create `/hooks/use-source-documents.ts`
  - [ ] React Query integration
  - [ ] Cache configuration (5min stale, 30min cache)
  - [ ] Loading states
  - [ ] Error states
  - [ ] Refetch functionality
- [ ] Create `/hooks/use-source-actions.ts` (optional)
  - [ ] Save to collection handler
  - [ ] Share source handler
  - [ ] Copy citation handler

### State Management
- [ ] Update ChatContext to include document IDs in messages
- [ ] Implement source caching strategy
- [ ] Handle message updates with sources

---

## Phase 3: UI Integration (Day 3)

### Message List Integration
- [ ] Update `/components/message-list.tsx`
  - [ ] Import MessageSources component
  - [ ] Add sources section to assistant messages
  - [ ] Pass document IDs from message data
- [ ] Update inline citation pattern handler
  - [ ] Add click handler to scroll to source
  - [ ] Implement highlight animation
  - [ ] Ensure tooltip still works

### Interactions
- [ ] Implement expand/collapse animation
  - [ ] Chevron rotation
  - [ ] List slide-down/up
  - [ ] Stagger animation for cards
- [ ] Implement citation click scroll
  - [ ] Auto-expand sources if collapsed
  - [ ] Smooth scroll to source card
  - [ ] Highlight effect (2s duration)
- [ ] Implement "View Document" action
  - [ ] Navigate to document detail page
  - [ ] Open in new tab option
- [ ] Implement "Save to Collection" action
  - [ ] Show collection selector
  - [ ] Optimistic update (show checkmark)
  - [ ] Success/error toast

### Responsive Design
- [ ] Test desktop layout (1920px)
- [ ] Test laptop layout (1366px)
- [ ] Test tablet landscape (1024px)
- [ ] Test tablet portrait (768px)
- [ ] Test mobile (375px)
- [ ] Test small mobile (320px)
- [ ] Adjust padding/spacing per breakpoint
- [ ] Test touch targets on mobile (44px min)

---

## Phase 4: Polish & Edge Cases (Day 4)

### Loading States
- [ ] Show skeleton screens while fetching
- [ ] Match number of skeletons to documentIds count
- [ ] Smooth transition from skeleton to content
- [ ] Loading indicator in badge

### Error Handling
- [ ] Full failure error state
  - [ ] Error message display
  - [ ] Retry button
  - [ ] Error logging
- [ ] Partial failure handling
  - [ ] Show available documents
  - [ ] Show error for failed documents
  - [ ] Maintain source numbering
- [ ] Network timeout handling
- [ ] Invalid document ID handling

### Edge Cases
- [ ] Zero sources (hide component)
- [ ] Single source (singular "source cited")
- [ ] Many sources (10+)
  - [ ] Add filter option
  - [ ] Add "Showing X-Y of Z"
  - [ ] Consider virtualization
- [ ] Missing document metadata
  - [ ] Graceful degradation
  - [ ] Show document ID as fallback
- [ ] Very long titles (wrap, max 3 lines)
- [ ] Very long preview text (line-clamp: 3)
- [ ] Mixed languages (show language in metadata)

### Performance Optimization
- [ ] Lazy load documents on expand
- [ ] Implement React Query caching
- [ ] Debounce expand/collapse (prevent spam)
- [ ] Virtualize long lists (20+ sources)
- [ ] Memoize source cards
- [ ] Test performance with 50 messages + sources

---

## Phase 5: Accessibility (Ongoing)

### ARIA Attributes
- [ ] Add `aria-expanded` to toggle button
- [ ] Add `aria-controls` linking to sources list
- [ ] Add `aria-label` for source count
- [ ] Add `role="region"` to sources container
- [ ] Add `role="list"` and `role="listitem"` to cards

### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Enter/Space to expand/collapse
- [ ] Arrow keys to navigate sources (optional)
- [ ] Escape to collapse (optional)
- [ ] Focus management on expand

### Screen Reader Support
- [ ] Announce source count
- [ ] Announce expand/collapse state
- [ ] Announce when documents load
- [ ] Announce errors
- [ ] Test with NVDA/JAWS

### Color Contrast
- [ ] Verify all text meets WCAG AA (4.5:1)
- [ ] Verify action buttons meet contrast
- [ ] Verify borders are visible
- [ ] Test with color blindness simulators

---

## Phase 6: Testing (Day 5)

### Unit Tests
- [ ] MessageSources component
  - [ ] Renders with 0 sources (hidden)
  - [ ] Renders with 1 source
  - [ ] Renders with multiple sources
  - [ ] Expand/collapse works
  - [ ] Passes correct props to SourceCard
- [ ] SourceCard component
  - [ ] Renders all metadata
  - [ ] Handles missing metadata
  - [ ] Click handlers work
  - [ ] Save state toggles
- [ ] useSourceDocuments hook
  - [ ] Fetches documents
  - [ ] Caches results
  - [ ] Handles errors
  - [ ] Refetch works

### Integration Tests
- [ ] Full message with sources renders
- [ ] Expanding sources fetches documents
- [ ] Clicking citation scrolls to source
- [ ] Saving to collection works end-to-end
- [ ] Viewing document navigates correctly

### E2E Tests (Playwright/Cypress)
- [ ] User receives AI response with sources
- [ ] User expands sources
- [ ] User views document
- [ ] User saves source to collection
- [ ] Mobile: User taps sources, scrolls, views

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] iOS Safari (iOS 15+)
- [ ] Android Chrome (Android 10+)

### Performance Testing
- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] No memory leaks
- [ ] Smooth 60fps animations

---

## Phase 7: Documentation (Day 6)

### Developer Docs
- [x] Design specification document
- [x] Visual reference with mockups
- [x] Type definitions
- [ ] Component API documentation
- [ ] Usage examples
- [ ] Migration guide for existing code

### User Docs
- [ ] User guide for sources feature
- [ ] How to interpret citations
- [ ] How to save sources
- [ ] FAQ section

### Code Comments
- [ ] JSDoc comments on all public functions
- [ ] Inline comments for complex logic
- [ ] Props documentation
- [ ] Type annotations

---

## Optional Enhancements (Future)

### Phase 2 Features
- [ ] Source filtering by document type
- [ ] Source sorting (relevance, date)
- [ ] Citation export (APA, MLA, Chicago)
- [ ] Copy all citations button
- [ ] Share individual source
- [ ] Source annotations/notes
- [ ] Excerpt highlighting
- [ ] Source comparison view

### Analytics
- [ ] Track source expansion rate
- [ ] Track most-viewed sources
- [ ] Track save-to-collection rate
- [ ] Track citation click-through rate

---

## Deployment Checklist

### Pre-Deploy
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Accessibility audit complete
- [ ] Performance benchmarks met
- [ ] Dark mode verified
- [ ] Mobile tested on real devices

### Deploy Strategy
- [ ] Feature flag enabled
- [ ] Staged rollout (10% → 50% → 100%)
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Gather user feedback

### Post-Deploy
- [ ] Monitor API response times
- [ ] Monitor error logs
- [ ] Collect user feedback
- [ ] Track usage analytics
- [ ] Plan iteration based on data

---

## Success Metrics

**Technical:**
- [ ] Page load time < 2s with sources
- [ ] Expand animation < 300ms
- [ ] API response time < 1s
- [ ] Zero accessibility violations
- [ ] 95%+ browser compatibility

**User Experience:**
- [ ] 60%+ of users expand sources
- [ ] 30%+ of users view full documents
- [ ] 15%+ of users save sources
- [ ] 90%+ positive feedback (thumbs up)

---

## Risk Mitigation

### Potential Issues
1. **Backend doesn't provide document IDs**
   - Mitigation: Work with backend team to add field
   - Fallback: Extract from fragments temporarily

2. **Large number of sources (100+)**
   - Mitigation: Implement virtualization
   - Fallback: Show first 20, add "Show more"

3. **Slow document fetching**
   - Mitigation: Pre-fetch common documents
   - Fallback: Show source IDs immediately, fetch details lazily

4. **Mobile performance issues**
   - Mitigation: Aggressive caching, lazy loading
   - Fallback: Simplified mobile view

---

## Team Assignments

**Frontend Developer:**
- Component implementation
- Styling and animations
- API integration

**Backend Developer:**
- Batch document endpoint
- Document ID inclusion in chat responses
- Performance optimization

**Designer:**
- Visual design review
- Animation specifications
- Accessibility review

**QA:**
- Test case creation
- Cross-browser testing
- Accessibility testing

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Core Structure | 1 day | ⬜ Not Started |
| Phase 2: Data Integration | 1 day | ⬜ Not Started |
| Phase 3: UI Integration | 1 day | ⬜ Not Started |
| Phase 4: Polish & Edge Cases | 1 day | ⬜ Not Started |
| Phase 5: Accessibility | Ongoing | ⬜ Not Started |
| Phase 6: Testing | 1 day | ⬜ Not Started |
| Phase 7: Documentation | 1 day | ⬜ Not Started |
| **Total** | **6 days** | ⬜ **0% Complete** |

---

## Notes

- Keep existing inline citation tooltips (they work well)
- Maintain backward compatibility if sources aren't available
- Consider mobile-first approach for all design decisions
- Prioritize performance (lazy loading, caching)
- Make it easy to add enhancements later

---

**Last Updated:** 2025-10-10
**Version:** 1.0
