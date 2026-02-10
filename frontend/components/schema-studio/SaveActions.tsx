"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Save, Download, RotateCcw, Loader2 } from "lucide-react";
import { PrimaryButton, SecondaryButton, DropdownButton, GlassButton } from "@/lib/styles/components";
import { cn } from "@/lib/utils";

/**
 * Props for the SaveActions component
 */
interface SaveActionsProps {
  /** Callback when save is clicked */
  onSave: () => void;
  /** Callback when export is clicked */
  onExport: (format: "json" | "yaml") => void;
  /** Callback when discard is clicked */
  onDiscard: () => void;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Show only export button (hide save and discard) */
  showOnlyExport?: boolean;
}

/**
 * SaveActions - Action buttons for saving, exporting, and discarding changes
 *
 * Features:
 * - Primary save button
 * - Export dropdown (JSON/YAML)
 * - Discard changes with confirmation
 * - Disabled states based on dirty/saving flags
 * - Loading indicator during save
 *
 * @example
 * ```tsx
 * <SaveActions
 *   onSave={handleSave}
 *   onExport={handleExport}
 *   onDiscard={handleDiscard}
 *   isDirty={true}
 *   isSaving={false}
 * />
 * ```
 */
export function SaveActions({
  onSave,
  onExport,
  onDiscard,
  isDirty,
  isSaving,
  showOnlyExport = false,
}: SaveActionsProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  /**
   * Handle discard with confirmation
   */
  const handleDiscardConfirm = () => {
    onDiscard();
    setShowDiscardDialog(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Export dropdown */}
        <DropdownButton
          icon={<Download className="h-4 w-4" />}
          label="Export"
          options={[
            { value: "json", label: "Export as JSON" },
            { value: "yaml", label: "Export as YAML" },
          ]}
          onChange={(value) => {
            if (value === "json" || value === "yaml") {
              onExport(value);
            }
          }}
          className={cn(
            "text-sm h-9 px-4 rounded-xl",
            "inline-flex items-center justify-center",
            "transition-all duration-300",
            "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm",
            "border border-slate-200/50 dark:border-slate-800/50",
            "hover:bg-white/80 dark:hover:bg-slate-800/80",
            "hover:scale-105 hover:shadow-md",
            "active:scale-[0.98] active:opacity-90",
            "font-semibold",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          )}
          align="end"
        />

        {/* Discard and Save buttons (only shown when not showOnlyExport) */}
        {!showOnlyExport && (
          <>
            {/* Discard button (only shown when dirty) - TEMPORARILY REMOVED */}
            {/* {isDirty && (
              <SecondaryButton
                size="sm"
                onClick={() => setShowDiscardDialog(true)}
                disabled={isSaving}
                icon={RotateCcw}
              >
                Discard
              </SecondaryButton>
            )} */}

            {/* Save button */}
            <GlassButton
              onClick={onSave}
              disabled={!isDirty || isSaving}
              isLoading={isSaving}
              className="w-auto"
            >
              {isSaving ? (
                <>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Schema</span>
                </>
              )}
            </GlassButton>
          </>
        )}
      </div>

      {/* Discard confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this schema. Discarding will revert
              all changes since your last save. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * TODO: Implementation checklist
 *
 * [x] Create save button with loading state
 * [x] Create export dropdown with JSON/YAML options
 * [x] Create discard button with confirmation
 * [x] Handle disabled states based on isDirty and isSaving
 * [ ] Add keyboard shortcut (Ctrl+S for save)
 * [ ] Add save success toast notification
 * [ ] Add save error handling and display
 * [ ] Implement auto-save toggle
 * [ ] Show last saved timestamp
 * [ ] Add "Save as Template" option
 * [ ] Add version history dropdown
 * [ ] Implement "Save and Test" action
 * [ ] Add export with custom filename
 * [ ] Support export to TypeScript types
 */
