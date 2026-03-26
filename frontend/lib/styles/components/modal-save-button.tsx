/**
 * Modal Save Button Component
 * Primary action button for modals following Legal Glass 2.0 design
 * "Sapphire Lens" - Translucent crystal button with inner highlights and colored glow
 *
 * This is now a wrapper around GlassButton for backward compatibility.
 */

"use client";

import React from 'react';
import { GlassButton, type GlassButtonProps } from './glass-button';

export type ModalSaveButtonProps = GlassButtonProps;

/**
 * Modal Save Button Component
 *
 * Primary action button for modals. Features "Sapphire Lens" design - a translucent
 * crystal button with gradient background, inner highlights, and colored glow.
 * Perfect for Glassmorphism 2.0 aesthetic.
 *
 * This component is now a wrapper around GlassButton for backward compatibility.
 *
 * @example
 * ```tsx
 * <ModalSaveButton onClick={handleSave} isLoading={saving}>
 *   Save
 * </ModalSaveButton>
 * ```
 */
export function ModalSaveButton(props: ModalSaveButtonProps): React.JSX.Element {
  return <GlassButton {...props} />;
}
