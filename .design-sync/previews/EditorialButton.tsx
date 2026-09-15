import * as React from "react";
import { EditorialButton } from "@juddges/design-system";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <EditorialButton>Primary</EditorialButton>
    <EditorialButton variant="secondary">Secondary</EditorialButton>
    <EditorialButton variant="ghost">Ghost</EditorialButton>
  </div>
);

export const WithArrow = () => (
  <div className="flex flex-wrap items-center gap-3">
    <EditorialButton href="#" arrow>Try search</EditorialButton>
    <EditorialButton variant="secondary" href="#" arrow>Sign up</EditorialButton>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <EditorialButton size="sm">Small</EditorialButton>
    <EditorialButton size="md">Medium</EditorialButton>
    <EditorialButton size="lg">Large</EditorialButton>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <EditorialButton loading>Loading</EditorialButton>
    <EditorialButton disabled>Disabled</EditorialButton>
    <EditorialButton href="https://example.org" external variant="secondary">External link</EditorialButton>
  </div>
);
