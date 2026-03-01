import type { JSX } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SecondaryButton, PrimaryButton } from "@/lib/styles/components";
import { ExtractionDataViewer } from "@/lib/styles/components/extraction/ExtractionDataViewer";

interface SchemaDialogsProps {
  showPreviewDialog: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  previewData: Record<string, unknown>;

  showSaveDialog: boolean;
  onSaveOpenChange: (open: boolean) => void;
  saveDialogError: string | null;
  onSaveDialogErrorChange: (message: string | null) => void;
  saveSchemaName: string;
  onSaveSchemaNameChange: (value: string) => void;
  saveSchemaDescription: string;
  onSaveSchemaDescriptionChange: (value: string) => void;
  isSaving: boolean;
  fieldsCount: number;
  onSave: () => void;

  showNewSchemaDialog: boolean;
  onNewSchemaOpenChange: (open: boolean) => void;
  onConfirmNewSchema: () => void;

  showLoadSchemaDialog: boolean;
  onLoadSchemaOpenChange: (open: boolean) => void;
  pendingLoadSchemaId: string | null;
  currentSchemaId: string | null;
  onCancelLoadSchema: () => void;
  onConfirmLoadSchema: () => void;

  showNavigationDialog: boolean;
  onNavigationOpenChange: (open: boolean) => void;
  onCancelNavigation: () => void;
  onConfirmNavigation: () => void;
}

export function SchemaDialogs({
  showPreviewDialog,
  onPreviewOpenChange,
  previewData,
  showSaveDialog,
  onSaveOpenChange,
  saveDialogError,
  onSaveDialogErrorChange,
  saveSchemaName,
  onSaveSchemaNameChange,
  saveSchemaDescription,
  onSaveSchemaDescriptionChange,
  isSaving,
  fieldsCount,
  onSave,
  showNewSchemaDialog,
  onNewSchemaOpenChange,
  onConfirmNewSchema,
  showLoadSchemaDialog,
  onLoadSchemaOpenChange,
  pendingLoadSchemaId,
  currentSchemaId,
  onCancelLoadSchema,
  onConfirmLoadSchema,
  showNavigationDialog,
  onNavigationOpenChange,
  onCancelNavigation,
  onConfirmNavigation,
}: SchemaDialogsProps): JSX.Element {
  return (
    <>
      <Dialog open={showPreviewDialog} onOpenChange={onPreviewOpenChange}>
        <DialogContent
          className={cn(
            "max-w-4xl max-h-[90vh]",
            "bg-white/80 dark:bg-slate-900/80",
            "backdrop-blur-xl backdrop-saturate-[180%]",
            "border border-primary/20 dark:border-primary/30",
            "shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
            "dark:shadow-[0_18px_45px_0_rgba(0,0,0,0.4),0_8px_20px_0_rgba(139,92,246,0.15),inset_0_1px_0_0_rgba(255,255,255,0.1)]"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Extraction Result Preview
            </DialogTitle>
            <DialogDescription>
              Preview how extracted data will be displayed based on your schema
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="py-4">
              {Object.keys(previewData).length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <div className="text-center">
                    <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Add fields to see extraction preview
                    </p>
                  </div>
                </div>
              ) : (
                <ExtractionDataViewer
                  data={previewData}
                  viewMode="document"
                  globalLayout="list"
                  hideCopyButtons={true}
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSaveDialog}
        onOpenChange={(open) => {
          onSaveOpenChange(open);
          if (!open) {
            onSaveDialogErrorChange(null);
          }
        }}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[500px]",
            "bg-white dark:bg-slate-900",
            "border border-border",
            "shadow-xl"
          )}
        >
          <DialogHeader>
            <DialogTitle>Save Schema</DialogTitle>
            <DialogDescription>
              Enter a name and description for your schema. These values will be preserved when you close the dialog.
            </DialogDescription>
          </DialogHeader>

          {saveDialogError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 mt-2">
              <p className="text-sm text-destructive font-medium">{saveDialogError}</p>
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="save-schema-name" className="text-sm font-semibold">
                Schema Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="save-schema-name"
                value={saveSchemaName}
                onChange={(e) => {
                  onSaveSchemaNameChange(e.target.value);
                  if (saveDialogError) {
                    onSaveDialogErrorChange(null);
                  }
                }}
                placeholder="Enter schema name..."
                className={cn(
                  "rounded-lg",
                  saveDialogError && "border-destructive focus-visible:ring-destructive"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveSchemaName.trim() && !isSaving) {
                    onSave();
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="save-schema-description" className="text-sm font-semibold">
                Description
              </Label>
              <Textarea
                id="save-schema-description"
                value={saveSchemaDescription}
                onChange={(e) => onSaveSchemaDescriptionChange(e.target.value)}
                placeholder="Enter schema description (optional)..."
                className="rounded-lg min-h-[100px]"
                rows={4}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <SecondaryButton onClick={() => onSaveOpenChange(false)} disabled={isSaving} size="sm">
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={onSave}
              disabled={!saveSchemaName.trim() || isSaving || fieldsCount === 0}
              size="sm"
              isLoading={isSaving}
              loadingText="Saving..."
            >
              Save Schema
            </PrimaryButton>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showNewSchemaDialog} onOpenChange={onNewSchemaOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. Starting a new schema will discard all unsaved changes. This action cannot be undone.
              <br />
              <br />
              Are you sure you want to start a new schema?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmNewSchema}
              className="bg-destructive hover:bg-destructive/90"
            >
              Start New Schema
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLoadSchemaDialog} onOpenChange={onLoadSchemaOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. {pendingLoadSchemaId === currentSchemaId ? "Reloading this schema" : "Loading another schema"} will discard all unsaved changes. This action cannot be undone.
              <br />
              <br />
              Are you sure you want to {pendingLoadSchemaId === currentSchemaId ? "reload" : "load"} this schema?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelLoadSchema}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmLoadSchema}
              className="bg-destructive hover:bg-destructive/90"
            >
              {pendingLoadSchemaId === currentSchemaId ? "Reload Schema" : "Load Schema"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showNavigationDialog} onOpenChange={onNavigationOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. Navigating away will discard all unsaved changes. This action cannot be undone.
              <br />
              <br />
              Are you sure you want to leave this page?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelNavigation}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmNavigation}
              className="bg-destructive hover:bg-destructive/90"
            >
              Leave Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
