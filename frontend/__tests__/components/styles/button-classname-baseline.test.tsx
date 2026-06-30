/**
 * @jest-environment jsdom
 *
 * className regression baseline for the button "zoo" (#144).
 *
 * The full consolidation (collapse PrimaryButton / SecondaryButton /
 * AccentButton / TextButton / IconButton / GlassButton into one cva-driven
 * `ui/button.tsx`, then codemod ~67 call sites) is visual-regression sensitive.
 * Real screenshot diffing is flaky across CI/local font rendering, so this
 * pins the *rendered Tailwind class string* of each variant instead — a
 * deterministic, jsdom-only proxy for "did the visual output change".
 *
 * When migrating a variant into the cva component, run these snapshots: a class
 * drift fails here, forcing an intentional `--ci=false -u` baseline update and a
 * visual sign-off rather than a silent regression.
 */

import React from 'react';
import { render } from '@testing-library/react';
import {
  PrimaryButton,
  SecondaryButton,
  VariantButton,
  IconButton,
} from '@/lib/styles/components';

// Minimal icon stub — the variants only need a component that takes className.
const Icon = (props: { className?: string }) => <svg data-testid="icon" {...props} />;

/** Return the className of the rendered <button> (or <a> for link variants). */
function classOf(ui: React.ReactElement): string {
  const { container } = render(ui);
  const el =
    container.querySelector('button') ??
    container.querySelector('a') ??
    container.firstElementChild;
  return el?.getAttribute('class') ?? '';
}

const SIZES = ['sm', 'md', 'lg'] as const;

describe('button className baseline (#144)', () => {
  describe('PrimaryButton', () => {
    for (const size of SIZES) {
      it(`size=${size}`, () => expect(classOf(<PrimaryButton size={size}>x</PrimaryButton>)).toMatchSnapshot());
    }
    it('disabled', () => expect(classOf(<PrimaryButton disabled>x</PrimaryButton>)).toMatchSnapshot());
    it('with icon', () => expect(classOf(<PrimaryButton icon={Icon}>x</PrimaryButton>)).toMatchSnapshot());
    it('size=xl', () => expect(classOf(<PrimaryButton size="xl">x</PrimaryButton>)).toMatchSnapshot());
    it('extraction variant', () => expect(classOf(<PrimaryButton>Start Extraction</PrimaryButton>)).toMatchSnapshot());
  });

  describe('SecondaryButton', () => {
    for (const size of SIZES) {
      it(`size=${size}`, () => expect(classOf(<SecondaryButton size={size}>x</SecondaryButton>)).toMatchSnapshot());
    }
    it('enhancedHover', () => expect(classOf(<SecondaryButton enhancedHover>x</SecondaryButton>)).toMatchSnapshot());
    it('enhancedFocus', () => expect(classOf(<SecondaryButton enhancedFocus>x</SecondaryButton>)).toMatchSnapshot());
    it('enhancedActive', () => expect(classOf(<SecondaryButton enhancedActive>x</SecondaryButton>)).toMatchSnapshot());
  });

  describe('AccentButton', () => {
    for (const size of SIZES) {
      it(`size=${size}`, () => expect(classOf(<VariantButton intent="accent" size={size}>x</VariantButton>)).toMatchSnapshot());
    }
  });

  describe('TextButton', () => {
    it('default', () => expect(classOf(<VariantButton intent="text">x</VariantButton>)).toMatchSnapshot());
    it('disabled', () => expect(classOf(<VariantButton intent="text" disabled>x</VariantButton>)).toMatchSnapshot());
  });

  describe('IconButton', () => {
    it('default', () => expect(classOf(<IconButton icon={Icon} aria-label="x" />)).toMatchSnapshot());
    it('enhancedHover', () => expect(classOf(<IconButton icon={Icon} aria-label="x" enhancedHover />)).toMatchSnapshot());
    it('variant=primary', () => expect(classOf(<IconButton icon={Icon} aria-label="x" variant="primary" />)).toMatchSnapshot());
    it('variant=error', () => expect(classOf(<IconButton icon={Icon} aria-label="x" variant="error" />)).toMatchSnapshot());
    it('hoverStyle=color', () => expect(classOf(<IconButton icon={Icon} aria-label="x" hoverStyle="color" />)).toMatchSnapshot());
    it('enhancedActive', () => expect(classOf(<IconButton icon={Icon} aria-label="x" enhancedActive />)).toMatchSnapshot());
    it('enhancedFocus', () => expect(classOf(<IconButton icon={Icon} aria-label="x" enhancedFocus />)).toMatchSnapshot());
    it('disabled', () => expect(classOf(<IconButton icon={Icon} aria-label="x" disabled />)).toMatchSnapshot());
    it('compact lg', () => expect(classOf(<IconButton icon={Icon} aria-label="x" compact size="lg" />)).toMatchSnapshot());
  });

  describe('GlassButton', () => {
    it('default', () => expect(classOf(<VariantButton intent="glass">x</VariantButton>)).toMatchSnapshot());
    it('white', () => expect(classOf(<VariantButton intent="glass" variant="white">x</VariantButton>)).toMatchSnapshot());
  });
});
