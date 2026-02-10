"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { addMonths, format, isSameDay, isSameMonth, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, isBefore, isAfter, setMonth as setMonthDate, setYear, getYear, getMonth } from "date-fns"
import { enUS } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface CalendarProps {
  className?: string
  mode?: "single" | "range"
  selected?: Date | DateRange | undefined
  onSelect?: (date: Date | DateRange | undefined) => void
  initialFocus?: boolean
  defaultMonth?: Date
  numberOfMonths?: number
  showOutsideDays?: boolean
  disabled?: boolean | ((date: Date) => boolean)
}

function Calendar({
  className,
  mode = "single",
  selected,
  onSelect,
  initialFocus = false,
  defaultMonth,
  numberOfMonths = 1,
  showOutsideDays = true,
  disabled,
}: CalendarProps) {
  const [month, setMonth] = React.useState(defaultMonth || new Date())
  const [hoveredDate, setHoveredDate] = React.useState<Date | null>(null)
  const [showMonthYearPicker, setShowMonthYearPicker] = React.useState(false)
  const [pickerView, setPickerView] = React.useState<"month" | "year">("month")
  const [yearView, setYearView] = React.useState(getYear(month))

  // Sync month with defaultMonth prop changes
  React.useEffect(() => {
    if (defaultMonth) {
      setMonth(defaultMonth)
      setYearView(getYear(defaultMonth))
    }
  }, [defaultMonth])

  // Sync yearView when month changes
  React.useEffect(() => {
    setYearView(getYear(month))
  }, [month])

  // Handle single date selection
  const isSelected = (date: Date) => {
    if (!selected) return false
    if (mode === "single") {
      return isSameDay(date, selected as Date)
    }
    if (mode === "range") {
      const range = selected as DateRange
      return range.from && isSameDay(date, range.from)
    }
    return false
  }

  // Handle range selection
  const isInRange = (date: Date) => {
    if (mode !== "range" || !selected) return false
    const range = selected as DateRange
    if (!range.from) return false
    if (range.to) {
      return isWithinInterval(date, { start: range.from, end: range.to })
    }
    if (hoveredDate && range.from) {
      const start = isBefore(range.from, hoveredDate) ? range.from : hoveredDate
      const end = isAfter(range.from, hoveredDate) ? range.from : hoveredDate
      return isWithinInterval(date, { start, end })
    }
    return false
  }

  const isRangeStart = (date: Date) => {
    if (mode !== "range" || !selected) return false
    const range = selected as DateRange
    return range.from && isSameDay(date, range.from)
  }

  const isRangeEnd = (date: Date) => {
    if (mode !== "range" || !selected) return false
    const range = selected as DateRange
    return range.to && isSameDay(date, range.to)
  }

  const isToday = (date: Date) => isSameDay(date, new Date())
  const isCurrentMonth = (date: Date) => isSameMonth(date, month)
  const isDisabled = (date: Date) => {
    if (typeof disabled === "function") return disabled(date)
    return disabled === true
  }

  const handleDateClick = (date: Date) => {
    if (isDisabled(date)) return

    if (mode === "single") {
      onSelect?.(date)
    } else if (mode === "range") {
      const currentRange = (selected as DateRange) || {}
      if (!currentRange.from || (currentRange.from && currentRange.to)) {
        // Start new range
        onSelect?.({ from: date, to: undefined })
      } else if (currentRange.from && !currentRange.to) {
        // Complete the range
        if (isBefore(date, currentRange.from)) {
          onSelect?.({ from: date, to: currentRange.from })
        } else {
          onSelect?.({ from: currentRange.from, to: date })
        }
      }
    }
  }

  const prev = () => setMonth((m) => addMonths(m, -1))
  const next = () => setMonth((m) => addMonths(m, 1))

  const handleMonthSelect = (selectedMonth: number) => {
    const newDate = setMonthDate(month, selectedMonth)
    setMonth(newDate)
    setShowMonthYearPicker(false)
    setPickerView("month")
  }

  const handleYearSelect = (selectedYear: number) => {
    setMonth(setYear(month, selectedYear))
    setPickerView("month")
  }

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMonthYearPicker(!showMonthYearPicker)
    setPickerView("month")
  }

  const handleYearViewClick = () => {
    setPickerView("year")
  }

  const currentYear = getYear(month)
  const currentMonth = getMonth(month)
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // Generate years for year picker (current year ± 12 years)
  const generateYears = () => {
    const years: number[] = []
    const startYear = yearView - 12
    const endYear = yearView + 12
    for (let y = startYear; y <= endYear; y++) {
      years.push(y)
    }
    return years
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Focus management
  const calendarRef = React.useRef<HTMLDivElement>(null)
  const pickerRef = React.useRef<HTMLDivElement>(null)
  
  React.useEffect(() => {
    if (initialFocus && calendarRef.current) {
      const firstButton = calendarRef.current.querySelector('button:not([disabled])')
      if (firstButton) {
        ;(firstButton as HTMLElement).focus()
      }
    }
  }, [initialFocus, month])

  // Close picker when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showMonthYearPicker &&
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowMonthYearPicker(false)
        setPickerView("month")
      }
    }

    if (showMonthYearPicker) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [showMonthYearPicker])

  return (
    <div
      ref={calendarRef}
      className={cn(
        "relative p-3",
        numberOfMonths > 1 && "flex gap-4",
        className
      )}
    >
      {Array.from({ length: numberOfMonths }).map((_, monthIndex) => {
        const displayMonth = addMonths(month, monthIndex)
        const displayMonthStart = startOfMonth(displayMonth)
        const displayMonthEnd = endOfMonth(displayMonth)
        const displayCalendarStart = showOutsideDays
          ? startOfWeek(displayMonthStart, { weekStartsOn: 0 })
          : displayMonthStart
        const displayCalendarEnd = showOutsideDays
          ? endOfWeek(displayMonthEnd, { weekStartsOn: 6 })
          : displayMonthEnd

        const displayCells: Date[] = []
        let currentDate = new Date(displayCalendarStart)
        while (currentDate <= displayCalendarEnd) {
          displayCells.push(new Date(currentDate))
          currentDate = new Date(currentDate)
          currentDate.setDate(currentDate.getDate() + 1)
        }

        return (
          <div
            key={monthIndex}
            className="relative bg-card text-card-foreground p-4 rounded-lg shadow-sm"
          >
            <div className="flex items-center justify-between mb-2 relative">
              {monthIndex === 0 && showMonthYearPicker ? (
                <div ref={pickerRef} className="absolute top-full left-0 right-0 z-50 mt-2 bg-popover border border-border rounded-md shadow-lg p-4">
                  {pickerView === "month" ? (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <button
                          type="button"
                          onClick={() => setYearView(y => y - 25)}
                          className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 w-8 p-0"
                          )}
                          aria-label="Previous years"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleYearViewClick}
                          className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 px-3 text-sm font-medium hover:bg-accent"
                          )}
                        >
                          {currentYear}
                        </button>
                        <button
                          type="button"
                          onClick={() => setYearView(y => y + 25)}
                          className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 w-8 p-0"
                          )}
                          aria-label="Next years"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {monthNames.map((monthName, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleMonthSelect(idx)}
                            className={cn(
                              "px-3 py-2 text-sm rounded-md transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              currentMonth === idx && "bg-primary text-primary-foreground hover:bg-primary"
                            )}
                          >
                            {monthName.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <button
                          type="button"
                          onClick={() => setYearView(y => y - 25)}
                          className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 w-8 p-0"
                          )}
                          aria-label="Previous years"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium">
                          {yearView - 12} - {yearView + 12}
                        </span>
                        <button
                          type="button"
                          onClick={() => setYearView(y => y + 25)}
                          className={cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-8 w-8 p-0"
                          )}
                          aria-label="Next years"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                        {generateYears().map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => handleYearSelect(year)}
                            className={cn(
                              "px-3 py-2 text-sm rounded-md transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              currentYear === year && "bg-primary text-primary-foreground hover:bg-primary"
                            )}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                onClick={prev}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "p-2 rounded-full size-9 opacity-50 hover:opacity-100"
                )}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleHeaderClick}
                className={cn(
                  "text-sm font-medium px-2 py-1 rounded-md transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                {format(displayMonth, "LLLL yyyy", { locale: enUS })}
              </button>
              <button
                type="button"
                onClick={next}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "p-2 rounded-full size-9 opacity-50 hover:opacity-100"
                )}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[0.8rem] text-muted-foreground font-medium mb-1">
              {weekdayLabels.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-sm text-center">
              {displayCells.map((date, i) => {
                const day = date.getDate()
                const isOutside = !isCurrentMonth(date)
                const selected = isSelected(date)
                const inRange = isInRange(date)
                const rangeStart = isRangeStart(date)
                const rangeEnd = isRangeEnd(date)
                const today = isToday(date)
                const disabled = isDisabled(date)

                return (
                  <div
                    key={i}
                    className={cn(
                      "h-9 flex items-center justify-center",
                      inRange && !rangeStart && !rangeEnd && "bg-accent",
                      rangeStart && "rounded-l-md",
                      rangeEnd && "rounded-r-md"
                    )}
                    onMouseEnter={() => mode === "range" && setHoveredDate(date)}
                    onMouseLeave={() => mode === "range" && setHoveredDate(null)}
                  >
                    <button
                      type="button"
                      onClick={() => handleDateClick(date)}
                      disabled={disabled}
                      className={cn(
                        "size-9 flex items-center justify-center rounded-md transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:pointer-events-none disabled:opacity-50",
                        selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                        today && !selected && "bg-accent text-accent-foreground",
                        isOutside && "text-muted-foreground opacity-50",
                        rangeStart && "bg-primary text-primary-foreground rounded-l-md",
                        rangeEnd && "bg-primary text-primary-foreground rounded-r-md",
                        inRange && !rangeStart && !rangeEnd && !selected && "bg-accent/50"
                      )}
                    >
                      {day}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { Calendar }
export type { CalendarProps }
