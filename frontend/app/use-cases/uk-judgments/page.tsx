'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { DateRangePicker } from "@/lib/styles/components";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

export interface UKJudgmentData {
  id: string;
  date: string;
  court: string;
  caseNumber: string;
  jurisdiction: string;
  subjectMatter: string;
  judgmentType: string;
  metadata?: Record<string, unknown>;
}

export default function UKJudgmentsAnalysisPage() {
  const [data, setData] = useState<UKJudgmentData[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("jurisdiction");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(2015, 0, 1),
    to: new Date(),
  });
  const [viewType, setViewType] = useState<"table" | "charts">("table");

  useEffect(() => {
    // TODO: Replace with actual API call
    const fetchData = async () => {
      try {
        // Simulated data fetch
        const mockData: UKJudgmentData[] = [
          {
            id: "1",
            date: "2023-01-15",
            court: "Supreme Court",
            caseNumber: "UKSC 2023/0001",
            jurisdiction: "England and Wales",
            subjectMatter: "Contract Law",
            judgmentType: "Final",
          },
          // Add more mock data as needed
        ];
        setData(mockData);
      } catch (error) {
        logger.error("Error fetching data: ", error);
      }
    };

    fetchData();
  }, []);

  const availableColumns = [
    { value: "jurisdiction", label: "Jurisdiction" },
    { value: "court", label: "Court" },
    { value: "subjectMatter", label: "Subject Matter" },
    { value: "judgmentType", label: "Judgment Type" },
  ];

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1800px]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">UK Judgments Analysis</h1>
        <div className="flex gap-4">
          <DateRangePicker
            value={dateRange}
            onChange={(nextValue) => {
              if (!nextValue || nextValue instanceof Date) {
                return;
              }
              setDateRange(nextValue);
            }}
          />
          <Select value={selectedColumn} onValueChange={setSelectedColumn}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column.value} value={column.value}>
                  {column.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={viewType} onValueChange={(v) => setViewType(v as "table" | "charts")}>
        <TabsList>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Judgment Data</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={data} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Jurisdiction Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {/* TODO: Add chart component */}
                <div className="h-[300px] flex items-center justify-center border rounded-lg">
                  Chart placeholder
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subject Matter Trends</CardTitle>
              </CardHeader>
              <CardContent>
                {/* TODO: Add trend chart component */}
                <div className="h-[300px] flex items-center justify-center border rounded-lg">
                  Trend chart placeholder
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Data Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Total Judgments</h3>
                <p className="text-2xl font-bold">{data.length}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Date Range</h3>
                <p className="text-lg">
                  {dateRange?.from && format(dateRange.from, "PPP")} -{" "}
                  {dateRange?.to && format(dateRange.to, "PPP")}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Selected Analysis</h3>
                <p className="text-lg">
                  {availableColumns.find((col) => col.value === selectedColumn)?.label}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
