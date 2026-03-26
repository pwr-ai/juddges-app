/**
 * Styled Calendar Component
 * Date picker component with design system styling, accessibility, and UX patterns
 * Used for date selection in filters and forms
 */

"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
 addMonths,
 format,
 isSameDay,
 isSameMonth,
 startOfMonth,
 endOfMonth,
 startOfWeek,
 endOfWeek,
 isWithinInterval,
 isBefore,
 isAfter,
 setMonth as setMonthDate,
 setYear,
 getYear,
 getMonth
} from "date-fns";
import { enUS } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

/**
 * Props for Calendar component
 */
export interface CalendarProps {
 /** Optional className for additional styling */
 className?: string;
 /** Selection mode - single date or date range */
 mode?: "single"|"range";
 /** Selection precision - full day (default) or month-level */
 precision?: "day"|"month";
 /** Selected date or date range */
 selected?: Date | DateRange | undefined;
 /** Callback when date is selected */
 onSelect?: (date: Date | DateRange | undefined) => void;
 /** Whether to focus the calendar on mount */
 initialFocus?: boolean;
 /** Default month to display */
 defaultMonth?: Date;
 /** Number of months to display */
 numberOfMonths?: number;
 /** Whether to show days outside the current month */
 showOutsideDays?: boolean;
 /** Disable specific dates or all dates */
 disabled?: boolean | ((date: Date) => boolean);
 /** Minimum date that can be selected (for validation) */
 minDate?: Date;
 /** Maximum date that can be selected (for validation) */
 maxDate?: Date;
}

/**
 * Styled Calendar Component
 *
 * A fully accessible date picker component that follows the design system patterns.
 * Supports single date and date range selection with proper keyboard navigation,
 * focus management, and ARIA labels.
 *
 * @example
 * ```tsx
 * <Calendar
 * mode="single"
 * selected={date}
 * onSelect={setDate}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <Calendar
 * mode="range"
 * selected={dateRange}
 * onSelect={setDateRange}
 * numberOfMonths={2}
 * />
 * ```
 */
export function Calendar({
 className,
 mode ="single",
 precision ="day",
 selected,
 onSelect,
 initialFocus = false,
 defaultMonth,
 numberOfMonths = 1,
 showOutsideDays = true,
 disabled,
 minDate,
 maxDate,
}: CalendarProps): React.JSX.Element {
 // Determine initial month: use selected date if available, otherwise defaultMonth or current date
 const getInitialMonth = (): Date => {
 if (selected) {
 if (mode === "range") {
 const range = selected as DateRange;
 return range.from || range.to || defaultMonth || new Date();
 } else {
 return selected as Date;
 }
 }
 return defaultMonth || new Date();
 };

 const [month, setMonth] = React.useState(getInitialMonth());
 const [hoveredDate, setHoveredDate] = React.useState<Date | null>(null);
 const [showMonthYearPicker, setShowMonthYearPicker] = React.useState(precision === "month");
 const [pickerView, setPickerView] = React.useState<"month"|"year">(
 precision === "month"? "year": "month"
 );
 const [yearView, setYearView] = React.useState(getYear(month));

 // Sync month with selected date or defaultMonth prop changes
 React.useEffect(() => {
 let newMonth: Date;
 if (selected) {
 if (mode === "range") {
 const range = selected as DateRange;
 newMonth = range.from || range.to || defaultMonth || new Date();
 } else {
 newMonth = selected as Date;
 }
 } else {
 newMonth = defaultMonth || new Date();
 }
 setMonth(newMonth);
 setYearView(getYear(newMonth));
 }, [selected, defaultMonth, mode]);

 // Sync yearView when month changes
 React.useEffect(() => {
 setYearView(getYear(month));
 }, [month]);

 // Handle single date selection
 const isSelected = (date: Date): boolean => {
 if (!selected) return false;
 if (mode === "single") {
 return isSameDay(date, selected as Date);
 }
 if (mode === "range") {
 const range = selected as DateRange;
 return !!(range.from && isSameDay(date, range.from));
 }
 return false;
 };

 // Handle range selection
 const isInRange = (date: Date): boolean => {
 if (mode !=="range"|| !selected) return false;
 const range = selected as DateRange;
 if (!range.from) return false;
 if (range.to) {
 return isWithinInterval(date, { start: range.from, end: range.to });
 }
 if (hoveredDate && range.from) {
 const start = isBefore(range.from, hoveredDate) ? range.from : hoveredDate;
 const end = isAfter(range.from, hoveredDate) ? range.from : hoveredDate;
 return isWithinInterval(date, { start, end });
 }
 return false;
 };

 const isRangeStart = (date: Date): boolean => {
 if (mode !=="range"|| !selected) return false;
 const range = selected as DateRange;
 return !!(range.from && isSameDay(date, range.from));
 };

 const isRangeEnd = (date: Date): boolean => {
 if (mode !=="range"|| !selected) return false;
 const range = selected as DateRange;
 return !!(range.to && isSameDay(date, range.to));
 };

 const isToday = (date: Date): boolean => isSameDay(date, new Date());
 const isCurrentMonth = (date: Date): boolean => isSameMonth(date, month);
 const isDisabled = (date: Date): boolean => {
 if (typeof disabled === "function") return disabled(date);
 if (disabled === true) return true;

 const dateToCheck = precision === "month"? startOfMonth(date) : date;

 // Check minDate (for TO date validation - must be >= FROM)
 if (minDate) {
 const minDateToCheck = precision === "month"? startOfMonth(minDate) : minDate;
 if (isBefore(dateToCheck, minDateToCheck)) {
 return true;
 }
 }

 // Check maxDate (for FROM date validation - must be <= TO)
 if (maxDate) {
 const maxDateToCheck = precision === "month"? startOfMonth(maxDate) : maxDate;
 if (isAfter(dateToCheck, maxDateToCheck)) {
 return true;
 }
 }

 // For range mode, disable dates that would create an invalid range (TO < FROM)
 if (mode === "range"&& selected) {
 const range = selected as DateRange;
 if (range.from && !range.to) {
 // We have a FROM date but no TO date yet
 // Disable dates/months that are before FROM
 const fromDate = precision === "month"? startOfMonth(range.from) : range.from;
 if (isBefore(dateToCheck, fromDate)) {
 return true;
 }
 }
 }

 return false;
 };

 const handleDateClick = (date: Date): void => {
 if (isDisabled(date)) return;

 if (mode === "single") {
 if (precision === "month") {
 onSelect?.(startOfMonth(date));
 } else {
 onSelect?.(date);
 }
 } else if (mode === "range") {
 const currentRange = (selected as DateRange) || {};
 const monthDate = precision === "month"? startOfMonth(date) : date;

 if (!currentRange.from || (currentRange.from && currentRange.to)) {
 // Start new range
 onSelect?.({ from: monthDate, to: undefined });
 } else if (currentRange.from && !currentRange.to) {
 // Complete the range - TO must be >= FROM (already validated by isDisabled)
 const fromMonth = precision === "month"? startOfMonth(currentRange.from) : currentRange.from;
 onSelect?.({ from: fromMonth, to: monthDate });
 }
 }
 };

 const prev = (): void => setMonth((m) => addMonths(m, -1));
 const next = (): void => setMonth((m) => addMonths(m, 1));

 const handleMonthSelect = (selectedMonth: number): void => {
 const newDate = setMonthDate(month, selectedMonth);
 setMonth(newDate);
 const monthStart = startOfMonth(newDate);

 // Check if this month is disabled
 if (isDisabled(monthStart)) {
 return;
 }

 if (precision === "month") {
 if (mode === "single") {
 onSelect?.(monthStart);
 setShowMonthYearPicker(false);
 } else if (mode === "range") {
 const currentRange = (selected as DateRange) || {};
 if (!currentRange.from || (currentRange.from && currentRange.to)) {
 // Start new range
 onSelect?.({ from: monthStart, to: undefined });
 } else if (currentRange.from && !currentRange.to) {
 // Complete the range - TO must be >= FROM (already validated by isDisabled)
 const fromMonth = startOfMonth(currentRange.from);
 onSelect?.({ from: fromMonth, to: monthStart });
 setShowMonthYearPicker(false);
 }
 }
 }
 setPickerView("month");
 };

 const handleYearSelect = (selectedYear: number): void => {
 setMonth(setYear(month, selectedYear));
 if (precision === "month") {
 // Keep picker open and switch to month view
 setShowMonthYearPicker(true);
 setPickerView("month");
 } else {
 setPickerView("month");
 }
 };

 const handleHeaderClick = (e: React.MouseEvent): void => {
 e.stopPropagation();
 if (precision === "day") {
 const nextOpen = !showMonthYearPicker;
 setShowMonthYearPicker(nextOpen);
 // When opening the picker in day-precision mode, show YEARS first, then allow switching to months
 if (nextOpen) {
 setPickerView("year");
 }
 } else if (precision === "month") {
 // For month precision, always show picker and reset to year view
 setShowMonthYearPicker(true);
 setPickerView("year");
 }
 };

 const handleYearViewClick = (): void => {
 setPickerView("year");
 };

 const currentYear = getYear(month);
 const currentMonth = getMonth(month);
 const monthNames = [
"January","February","March","April","May","June",
"July","August","September","October","November","December"
 ];

 // Generate years for year picker (current year ± 12 years)
 const generateYears = (): number[] => {
 const years: number[] = [];
 const startYear = yearView - 12;
 const endYear = yearView + 12;
 for (let y = startYear; y <= endYear; y++) {
 years.push(y);
 }
 return years;
 };

 const weekdayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

 // Focus management
 const calendarRef = React.useRef<HTMLDivElement>(null);
 const pickerRef = React.useRef<HTMLDivElement>(null);

 React.useEffect(() => {
 if (initialFocus && calendarRef.current) {
 const firstButton = calendarRef.current.querySelector('button:not([disabled])');
 if (firstButton) {
 (firstButton as HTMLElement).focus();
 }
 }
 }, [initialFocus, month]);

 // Close picker when clicking outside
 React.useEffect(() => {
 const handleClickOutside = (event: MouseEvent): void => {
 if (
 precision === "day"&&
 showMonthYearPicker &&
 pickerRef.current &&
 !pickerRef.current.contains(event.target as Node) &&
 calendarRef.current &&
 !calendarRef.current.contains(event.target as Node)
 ) {
 setShowMonthYearPicker(false);
 setPickerView("month");
 }
 };

 if (precision === "day"&& showMonthYearPicker) {
 document.addEventListener("mousedown", handleClickOutside);
 return () => {
 document.removeEventListener("mousedown", handleClickOutside);
 };
 }
 }, [showMonthYearPicker, precision]);

 const renderMonthYearPicker = (): React.ReactNode => {
 return pickerView === "month"? (
 <>
 {precision === "day"? (
 <div className="flex items-center justify-between mb-3">
 <IconButton
 icon={ChevronsLeft}
 onClick={() => setYearView((y) => y - 25)}
 aria-label="Previous years"
 variant="muted"
 size="sm"
 />
 <button
 type="button"
 onClick={handleYearViewClick}
 className={cn(
"h-8 px-3 text-sm font-medium rounded-lg transition-all duration-300",
"bg-white/60",
"border border-slate-200/50",
"hover:bg-white/80",
"hover:border-primary/60",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
 )}
 >
 {currentYear}
 </button>
 <IconButton
 icon={ChevronsRight}
 onClick={() => setYearView((y) => y + 25)}
 aria-label="Next years"
 variant="muted"
 size="sm"
 />
 </div>
 ) : null}
 <div className="grid grid-cols-3 gap-2">
 {monthNames.map((monthName, idx) => {
 // Create the full date for this month in the current year context
 const monthDate = setMonthDate(month, idx);
 const monthStart = startOfMonth(monthDate);

 // Check if this month should be disabled using the isDisabled function
 const monthDisabled = isDisabled(monthStart);

 return (
 <button
 key={idx}
 type="button"
 onClick={() => {
 if (!monthDisabled) {
 handleMonthSelect(idx);
 }
 }}
 disabled={monthDisabled}
 className={cn(
"px-3 py-2 text-sm rounded-lg transition-all duration-300",
"bg-white/60",
"border border-slate-200/50",
"hover:bg-white/80",
"hover:border-primary/60",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
 monthDisabled &&"opacity-50 cursor-not-allowed",
 currentMonth === idx &&
 cn(
"bg-gradient-to-br from-primary/30 via-indigo-500/30 to-purple-500/20",
"",
"border-primary/30 ring-2 ring-primary/30",
"text-primary-foreground font-semibold",
"hover:from-primary/40 hover:via-indigo-500/40 hover:to-purple-500/30"
 )
 )}
 aria-label={`Select ${monthName}${monthDisabled ? "(disabled)": ""}`}
 aria-disabled={monthDisabled}
 >
 {monthName.slice(0, 3)}
 </button>
 );
 })}
 </div>
 </>
 ) : (
 <>
 <div className="flex items-center justify-between mb-3">
 <IconButton
 icon={ChevronsLeft}
 onClick={() => setYearView((y) => y - 25)}
 aria-label="Previous years"
 variant="muted"
 size="sm"
 />
 <span className="text-sm font-medium text-foreground">
 {yearView - 12} - {yearView + 12}
 </span>
 <IconButton
 icon={ChevronsRight}
 onClick={() => setYearView((y) => y + 25)}
 aria-label="Next years"
 variant="muted"
 size="sm"
 />
 </div>
 <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
 {generateYears().map((year) => {
 // Check if this year should be disabled
 // Create a date in the middle of the year to check if the entire year is invalid
 const yearDate = new Date(year, 5, 15); // June 15th of the year
 const yearStart = startOfMonth(new Date(year, 0, 1)); // January 1st of the year
 const yearEnd = endOfMonth(new Date(year, 11, 1)); // December 31st of the year

 let yearDisabled = false;

 // Check minDate - disable if entire year is before minDate
 if (minDate) {
 const minDateToCheck = precision === "month"? startOfMonth(minDate) : minDate;
 // If the entire year (end of year) is before minDate, disable it
 if (isBefore(yearEnd, minDateToCheck)) {
 yearDisabled = true;
 }
 }

 // Check maxDate - disable if entire year is after maxDate
 if (!yearDisabled && maxDate) {
 const maxDateToCheck = precision === "month"? startOfMonth(maxDate) : maxDate;
 // If the entire year (start of year) is after maxDate, disable it
 if (isAfter(yearStart, maxDateToCheck)) {
 yearDisabled = true;
 }
 }

 // Also check the general disabled function
 if (!yearDisabled) {
 yearDisabled = isDisabled(yearDate);
 }

 return (
 <button
 key={year}
 type="button"
 onClick={() => {
 if (!yearDisabled) {
 handleYearSelect(year);
 }
 }}
 disabled={yearDisabled}
 className={cn(
"px-3 py-2 text-sm rounded-lg transition-all duration-300",
"bg-white/60",
"border border-slate-200/50",
"hover:bg-white/80",
"hover:border-primary/60",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
 yearDisabled &&"opacity-50 cursor-not-allowed",
 currentYear === year &&
 cn(
"bg-gradient-to-br from-primary/30 via-indigo-500/30 to-purple-500/20",
"",
"border-primary/30 ring-2 ring-primary/30",
"text-primary-foreground font-semibold",
"hover:from-primary/40 hover:via-indigo-500/40 hover:to-purple-500/30"
 )
 )}
 aria-label={`Select year ${year}${yearDisabled ? "(disabled)": ""}`}
 aria-disabled={yearDisabled}
 >
 {year}
 </button>
 );
 })}
 </div>
 </>
 );
 };

 return (
 <div
 ref={calendarRef}
 className={cn(
"relative p-3",
 numberOfMonths > 1 &&"flex gap-4",
 className
 )}
 role="application"
 aria-label="Calendar"
 >
 {Array.from({ length: numberOfMonths }).map((_, monthIndex) => {
 const displayMonth = addMonths(month, monthIndex);
 const displayMonthStart = startOfMonth(displayMonth);
 const displayMonthEnd = endOfMonth(displayMonth);
 const displayCalendarStart = showOutsideDays
 ? startOfWeek(displayMonthStart, { weekStartsOn: 0 })
 : displayMonthStart;
 const displayCalendarEnd = showOutsideDays
 ? endOfWeek(displayMonthEnd, { weekStartsOn: 6 })
 : displayMonthEnd;

 const displayCells: Date[] = [];
 let currentDate = new Date(displayCalendarStart);
 while (currentDate <= displayCalendarEnd) {
 displayCells.push(new Date(currentDate));
 currentDate = new Date(currentDate);
 currentDate.setDate(currentDate.getDate() + 1);
 }

 return (
 <div
 key={monthIndex}
 className={cn(
"relative rounded-xl p-4 shadow-sm",
"bg-gradient-to-br from-white/60 via-blue-50/30 to-indigo-50/20",
"",
"backdrop-blur-sm",
"border border-slate-200/50"
 )}
 >
 {precision === "day"? (
 <div className="flex items-center justify-between mb-2 relative">
 {monthIndex === 0 && showMonthYearPicker ? (
 <div
 ref={pickerRef}
 className={cn(
"absolute top-full left-0 right-0 z-50 mt-2 rounded-xl shadow-xl p-4",
"bg-white/95",
"backdrop-blur-md",
"border border-slate-200/50"
 )}
 role="dialog"
 aria-label="Month and year picker"
 >
 {renderMonthYearPicker()}
 </div>
 ) : null}
 <IconButton
 icon={ChevronLeft}
 onClick={prev}
 aria-label="Previous month"
 variant="muted"
 size="sm"
 />
 <button
 type="button"
 onClick={handleHeaderClick}
 className={cn(
"text-sm font-semibold px-3 py-1.5 rounded-lg transition-all duration-300",
"bg-white/60",
"border border-slate-200/50",
"hover:bg-white/80",
"hover:border-primary/60",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"text-foreground"
 )}
 aria-label={`Select month and year. Current: ${format(displayMonth,"LLLL yyyy", { locale: enUS })}`}
 >
 {format(displayMonth,"LLLL yyyy", { locale: enUS })}
 </button>
 <IconButton
 icon={ChevronRight}
 onClick={next}
 aria-label="Next month"
 variant="muted"
 size="sm"
 />
 </div>
 ) : null}

 {precision === "month"? (
 <div className="mt-2">
 {renderMonthYearPicker()}
 </div>
 ) : (
 <>
 <div className="grid grid-cols-7 gap-1 text-center text-[0.8rem] text-muted-foreground font-medium mb-1">
 {weekdayLabels.map((d) => (
 <div key={d} className="py-1"aria-label={d}>
 {d}
 </div>
 ))}
 </div>

 <div className="grid grid-cols-7 gap-1 text-sm text-center">
 {displayCells.map((date, i) => {
 const day = date.getDate();
 const isOutside = !isCurrentMonth(date);
 const selected = isSelected(date);
 const inRange = isInRange(date);
 const rangeStart = isRangeStart(date);
 const rangeEnd = isRangeEnd(date);
 const today = isToday(date);
 const disabled = isDisabled(date);

 return (
 <div
 key={i}
 className={cn(
"h-9 flex items-center justify-center",
 inRange && !rangeStart && !rangeEnd && cn(
"bg-gradient-to-br from-primary/10 via-indigo-500/10 to-purple-500/10",
""
 ),
 rangeStart &&"rounded-l-md",
 rangeEnd &&"rounded-r-md"
 )}
 onMouseEnter={() => mode === "range"&& setHoveredDate(date)}
 onMouseLeave={() => mode === "range"&& setHoveredDate(null)}
 >
 <button
 type="button"
 onClick={() => handleDateClick(date)}
 disabled={disabled}
 className={cn(
"size-9 flex items-center justify-center rounded-lg transition-all duration-300",
"bg-white/40",
"border border-slate-200/30",
"hover:bg-gradient-to-br hover:from-primary/20 hover:via-indigo-500/15 hover:to-purple-500/15",
"hover:border-primary/50",
"hover:shadow-md hover:shadow-primary/10",
"hover:scale-105",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"disabled:pointer-events-none disabled:opacity-50",
 // Selected state - PROMINENT gradient like PrimaryButton
 selected && cn(
"bg-gradient-to-br from-blue-400/50 via-indigo-400/50 via-purple-400/50 to-purple-400/30",
"",
"!border !border-primary/30 ring-2 ring-primary/30",
"text-foreground font-bold",
"shadow-lg shadow-primary/20",
"hover:from-blue-400/60 hover:via-indigo-400/60 hover:via-purple-400/60 hover:to-purple-400/40",
"hover:shadow-xl hover:shadow-primary/30",
"hover:scale-110"
 ),
 // Today state (when not selected) - highlight with gradient
 today && !selected && cn(
"bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-purple-50/50",
"",
"!border !border-primary/40",
"ring-1 ring-primary/20",
"font-bold text-primary",
"shadow-sm shadow-primary/10"
 ),
 // Outside month
 isOutside &&"text-muted-foreground opacity-50",
 // Range start - PROMINENT gradient
 rangeStart && cn(
"bg-gradient-to-br from-blue-400/50 via-indigo-400/50 via-purple-400/50 to-purple-400/30",
"",
"!border !border-primary/30 ring-2 ring-primary/30",
"text-foreground font-bold rounded-l-lg",
"shadow-lg shadow-primary/20",
"hover:from-blue-400/60 hover:via-indigo-400/60 hover:via-purple-400/60 hover:to-purple-400/40",
"hover:shadow-xl hover:shadow-primary/30",
"hover:scale-110"
 ),
 // Range end - PROMINENT gradient
 rangeEnd && cn(
"bg-gradient-to-br from-blue-400/50 via-indigo-400/50 via-purple-400/50 to-purple-400/30",
"",
"!border !border-primary/30 ring-2 ring-primary/30",
"text-foreground font-bold rounded-r-lg",
"shadow-lg shadow-primary/20",
"hover:from-blue-400/60 hover:via-indigo-400/60 hover:via-purple-400/60 hover:to-purple-400/40",
"hover:shadow-xl hover:shadow-primary/30",
"hover:scale-110"
 ),
 // In range (but not start/end) - more visible
 inRange && !rangeStart && !rangeEnd && !selected && cn(
"bg-gradient-to-br from-blue-100/60 via-indigo-100/50 to-purple-100/40",
"",
"border border-primary/20"
 )
 )}
 aria-label={`${format(date,"EEEE, MMMM d, yyyy")}${selected ? "(selected)": ""}${today ? "(today)": ""}`}
 aria-disabled={disabled}
 >
 {day}
 </button>
 </div>
 );
 })}
 </div>
 </>
 )}
 </div>
 );
 })}
 </div>
 );
}
