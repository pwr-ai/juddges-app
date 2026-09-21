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
import { logger } from "@/lib/logger";

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
 logger.error("Export failed: ", error);
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
 icon: <FileText className="h-5 w-5"/>,
 },
 {
 value: "docx",
 label: "Word (DOCX)",
 description: "Best for editing and research memos",
 icon: <FileDown className="h-5 w-5"/>,
 },
 ];

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 				<DialogHeader>
					<DialogTitle className="font-serif text-lg font-bold text-ink">
						Export Conversation
					</DialogTitle>
					<DialogDescription className="font-mono text-xs text-ink-soft">
						Export this chat conversation including AI responses and cited
						sources.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Format Selection */}
					<div className="space-y-2">
						<label className="font-mono text-xs uppercase tracking-wider text-ink-soft font-medium">
							Format
						</label>
						<div className="grid grid-cols-2 gap-3">
							{formats.map((f) => (
								<button
									key={f.value}
									onClick={() => setFormat(f.value)}
									className={cn(
										"flex flex-col items-center gap-2 rounded-none border p-4 transition-colors",
										format === f.value
											? "border-oxblood bg-parchment-deep"
											: "border-rule bg-parchment hover:border-rule-strong hover:bg-parchment-deep/50"
									)}
								>
									<div
										className={cn(
											"rounded-none p-2 transition-colors",
											format === f.value
												? "bg-oxblood/10 text-oxblood"
												: "bg-parchment-deep text-ink-soft"
										)}
									>
										{f.icon}
									</div>
									<div className="text-center">
										<p className={cn(
											"font-serif text-sm font-semibold",
											format === f.value ? "text-oxblood" : "text-ink"
										)}>
											{f.label}
										</p>
										<p className="font-mono text-xs text-ink-soft">
											{f.description}
										</p>
									</div>
								</button>
							))}
						</div>
					</div>

					{/* Include Sources Toggle */}
					<div className="flex items-center justify-between rounded-none border border-rule px-4 py-3 bg-parchment">
						<div>
							<p className="font-serif text-sm font-semibold text-ink">Include sources</p>
							<p className="font-mono text-xs text-ink-soft">
								Add cited document references and summaries
							</p>
						</div>
						<button
							onClick={() => setIncludeSources(!includeSources)}
							className={cn(
								"relative h-6 w-11 rounded-none border border-rule transition-colors focus:outline-none focus:ring-1 focus:ring-oxblood",
								includeSources ? "bg-oxblood" : "bg-parchment-deep"
							)}
							role="switch"
							aria-checked={includeSources}
							data-testid="include-sources-toggle"
						>
							<span
								className={cn(
									"absolute top-0.5 left-0.5 h-4 w-4 rounded-none transition-transform duration-200",
									includeSources
										? "translate-x-5 bg-parchment"
										: "translate-x-0 bg-ink-soft"
								)}
							/>
						</button>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						variant="outline"
						className="rounded-none border-rule text-ink hover:bg-parchment-deep"
						onClick={() => onOpenChange(false)}
						disabled={isExporting}
					>
						Cancel
					</Button>
					<Button
						className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep"
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
