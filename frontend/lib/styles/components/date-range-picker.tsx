"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";

export interface StyledDateRangePickerProps {
 value?: DateRange;
 onChange?: (date: DateRange | undefined) => void;
 className?: string;
}

export function DateRangePicker({
 value,
 onChange,
 className,
}: StyledDateRangePickerProps): React.JSX.Element {
 const handleSelect = (date: Date | DateRange | undefined): void => {
 // With mode="range"we expect DateRange | undefined, but guard just in case
 if (!date || date instanceof Date) {
 return;
 }
 onChange?.(date);
 };

 return (
 <div className={cn("grid gap-2", className)}>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className={cn(
"w-[300px] justify-start text-left font-medium rounded-xl transition-all duration-300",
"bg-white/60 backdrop-blur-sm",
"border-slate-200/50",
"hover:bg-white/80",
"hover:scale-[1.02] hover:shadow-md",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 !value &&"text-muted-foreground"
 )}
 >
 <CalendarIcon className="mr-2 h-4 w-4 text-primary"/>
 {value?.from ? (
 value.to ? (
 <>
 {format(value.from,"MMM yyyy")} -{""}
 {format(value.to,"MMM yyyy")}
 </>
 ) : (
 format(value.from,"MMM yyyy")
 )
 ) : (
 <span>Pick a date range</span>
 )}
 </Button>
 </PopoverTrigger>
 <PopoverContent
 className="w-auto p-0 rounded-xl border-slate-200/50 bg-transparent backdrop-blur-md shadow-xl"
 align="start"
 >
 <Calendar
 mode="range"
 precision="month"
 defaultMonth={value?.from}
 selected={value}
 onSelect={handleSelect}
 numberOfMonths={2}
 />
 </PopoverContent>
 </Popover>
 </div>
 );
}
