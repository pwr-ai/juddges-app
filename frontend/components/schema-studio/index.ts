/**
 * Schema Studio - Visual Schema Editor Components
 *
 * This module provides a complete visual editing experience for extraction schemas,
 * combining AI-driven chat with manual field editing.
 *
 * @module schema-studio
 */

// Main layout
export { SchemaStudioLayout } from "./SchemaStudioLayout";

// Panes
export { ChatPane } from "./ChatPane";
export { CanvasPane } from "./CanvasPane";
export { ExtractionInstructionsPanel } from "./ExtractionInstructionsPanel";

// Canvas components
export { SchemaCanvas } from "./SchemaCanvas";
export { FieldCard } from "./FieldCard";
export { FieldEditor } from "./FieldEditor";

// Metadata and actions
export { SaveActions } from "./SaveActions";

// Types
export type {
  SchemaField,
  FieldType,
  FieldCreator,
  FieldVisualMetadata,
  ValidationRules,
  SchemaMessage,
  SchemaValidationResult,
  SchemaMetadata,
} from "./types";

export { TYPE_COLORS } from "./types";
