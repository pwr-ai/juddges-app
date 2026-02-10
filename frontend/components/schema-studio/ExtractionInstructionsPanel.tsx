"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Props for the ExtractionInstructionsPanel component
 */
interface ExtractionInstructionsPanelProps {
  /** Current value of the extraction instructions */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Debounce delay for onChange in milliseconds */
  debounceMs?: number;
}

/**
 * ExtractionInstructionsPanel - Collapsible panel for extraction context
 *
 * Provides a text area for users to enter extraction instructions/context
 * that will be passed to the LLM during schema generation.
 *
 * @example
 * ```tsx
 * <ExtractionInstructionsPanel
 *   value={instructions}
 *   onChange={setInstructions}
 *   placeholder="Enter context about your documents..."
 * />
 * ```
 */
export function ExtractionInstructionsPanel({
  value,
  onChange,
  disabled = false,
  placeholder = "Enter context about your documents (e.g., 'These are Polish tax interpretations from 2020-2024 containing rulings about VAT deductions')...",
  maxLength = 5000,
  debounceMs = 500,
}: ExtractionInstructionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  // Sync local value with prop value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, value, onChange, debounceMs]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        setLocalValue(newValue);
      }
    },
    [maxLength]
  );

  const characterCount = localValue.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <div
      className={cn(
        "border-b border-white/20 dark:border-slate-700/20",
        "bg-white/5 dark:bg-slate-900/5"
      )}
    >
      {/* Header - Clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2.5 flex items-center gap-2",
          "text-left text-sm font-medium",
          "hover:bg-white/10 dark:hover:bg-slate-900/10",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-foreground">Extraction Context</span>
        {localValue && !isExpanded && (
          <span className="text-xs text-muted-foreground ml-auto truncate max-w-[150px]">
            {localValue.slice(0, 50)}
            {localValue.length > 50 && "..."}
          </span>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">
                Provide context about your documents to help the AI generate
                better extraction schemas. Include document type, time period,
                language, and any specific extraction requirements.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </button>

      {/* Expandable content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isExpanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-3">
          <Textarea
            value={localValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            className={cn(
              "resize-none text-xs",
              "bg-white/60 dark:bg-slate-900/60",
              "border-white/30 dark:border-slate-700/30",
              "focus:border-primary/50 focus:ring-primary/30",
              "placeholder:text-muted-foreground/70"
            )}
          />
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[10px] text-muted-foreground">
              This context will be included in schema generation prompts
            </span>
            <span
              className={cn(
                "text-[10px]",
                isNearLimit ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              {characterCount}/{maxLength}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
