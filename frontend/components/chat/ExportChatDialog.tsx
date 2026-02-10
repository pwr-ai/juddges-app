"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, FileDown, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ExportFormat, ChatExportData } from "@/lib/chat-export";

interface ExportChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
}

export function ExportChatDialog({
  open,
  onOpenChange,
  chatId,
}: ExportChatDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [includeSources, setIncludeSources] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch export data from API
      const response = await fetch(`/api/chats/${chatId}/export`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to fetch chat data");
      }

      const data: ChatExportData = await response.json();

      if (!data.messages || data.messages.length === 0) {
        toast.error("No messages to export");
        return;
      }

      // Dynamic import to avoid loading heavy libraries upfront
      const { exportChat } = await import("@/lib/chat-export");
      await exportChat(data, format, includeSources);

      toast.success("Chat exported", {
        description: `Saved as ${format.toUpperCase()} file`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Export failed", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formats: Array<{
    value: ExportFormat;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "pdf",
      label: "PDF",
      description: "Best for sharing and printing",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      value: "docx",
      label: "Word (DOCX)",
      description: "Best for editing and research memos",
      icon: <FileDown className="h-5 w-5" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Conversation</DialogTitle>
          <DialogDescription>
            Export this chat conversation including AI responses and cited
            sources.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {formats.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all duration-200",
                    "hover:border-primary/50 hover:bg-primary/5",
                    format === f.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-slate-200 dark:border-slate-700"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg p-2 transition-colors",
                      format === f.value
                        ? "bg-primary/10 text-primary"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    )}
                  >
                    {f.icon}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Include Sources Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Include sources</p>
              <p className="text-xs text-muted-foreground">
                Add cited document references and summaries
              </p>
            </div>
            <button
              onClick={() => setIncludeSources(!includeSources)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                includeSources
                  ? "bg-primary"
                  : "bg-slate-300 dark:bg-slate-600"
              )}
              role="switch"
              aria-checked={includeSources}
              data-testid="include-sources-toggle"
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                  includeSources ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            data-testid="export-confirm-button"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
