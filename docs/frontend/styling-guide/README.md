# Styling Guide

## Overview

This directory contains the design system documentation for Legal Glassmorphism 2.0. These guides serve as the **single source of truth** for styling standards.

---

## Documents

### Primary Guide

- **[guide-v2.md](./guide-v2.md)** — Legal Glassmorphism 2.0 specification (color system, component patterns, icon protocol, typography, dark mode, accessibility, migration from 1.0)

### Quick References

- **[colors-reference.md](./colors-reference.md)** — One-page color quick reference (opacity scale, shades, common patterns, component lookup)
- **[component-colors.md](./component-colors.md)** — Component color cheat sheet (buttons, cards, inputs, badges, state colors, gradients)

### Guides

- **[creating-components.md](./creating-components.md)** — Step-by-step component creation (templates, checklist, testing guidelines)
- **[migration-examples.md](./migration-examples.md)** — Before/after migration examples from 1.0 to 2.0
- **[demo-page.md](./demo-page.md)** — How to add components to the style demo page

---

## Quick Start

1. **Start here**: Read [guide-v2.md](./guide-v2.md) for the full design system spec
2. **During development**: Use [colors-reference.md](./colors-reference.md) for quick color lookup
3. **Creating components**: Follow [creating-components.md](./creating-components.md)

---

## Design System Standards

### Opacity Scale

6 standardized values: `/10`, `/15`, `/20`, `/30`, `/50`, `/80`

### Color Shades

- **Light Mode**: `400` shades (blue-400, indigo-400)
- **Dark Mode**: `500` shades (blue-500, indigo-500)

### Design Colors (3 Core)

1. **Primary** (CSS variable)
2. **Indigo** (gradients, accents)
3. **Blue** (backgrounds)

### Accessibility

- **Focus States**: `ring-2 ring-primary ring-offset-2`
- **Touch Targets**: Minimum 44x44px
- **Contrast**: 4.5:1 for text, 3:1 for large text

---

## Related

- **Style Demo Page**: `/app/style-demo/page.tsx`
- **Color Definitions**: `/lib/styles/colors/`
- **Style Components**: `/lib/styles/components/`
