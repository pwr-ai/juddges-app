'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import {
  ChartContainer,
  ChartTooltip
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { prepareChartData } from '@/lib/chart-data-preparation';
import { JudgmentData } from './types';

interface ChartDataItem {
  year: string;
  values: Record<string, number>;
}

export default function SwissFrancAnalysisPage() {
  const [data, setData] = useState<JudgmentData[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("wynik_sprawy");
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [debugVisible, setDebugVisible] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/data/extractions_df.json');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (error) {
        console.error("Error fetching data:", error);
        setData([]); // Reset data on error
      }
    };

    fetchData();
  }, []); // Only fetch once on component mount

  useEffect(() => {
    if (data.length > 0) {
      try {
        const preparedData = prepareChartData(data, {
          selectedColumn: selectedColumn as keyof JudgmentData
        });
        console.log('Chart Data:', preparedData); // Added logging
        setChartData(preparedData);
      } catch (error) {
        console.error('Error preparing chart data:', error);
        setChartData([]);
      }
    }
  }, [data, selectedColumn]);

  const chartConfig = {
    value: {
      label: "Count",
      color: "var(--chart-1)"
    }
  };

  const distinctColors = [
    "#2563eb", // Blue
    "#dc2626", // Red
    "#16a34a", // Green
    "#ca8a04", // Yellow
    "#9333ea", // Purple
    "#c2410c", // Orange
    "#0891b2", // Cyan
    "#be123c", // Pink
  ];

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1800px] space-y-16">
      <h1 className="text-3xl font-bold mb-6">Swiss franc-denominated loans</h1>
      <p className="text-lg mb-6">
        This analysis examines the evolution of judicial decisions regarding Swiss franc-denominated loans in Poland.
        Following landmark decisions by the Court of Justice of the European Union (TSUE), there has been a significant
        shift in how national courts rule on these cases. Over time, courts have increasingly favored consumers over banks,
        recognizing unfair contract terms and allowing for loan invalidation or conversion. This trend analysis helps
        visualize how judicial precedent has developed and its impact on consumer protection in financial markets.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Data Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-100 rounded-lg shadow">
                <h3 className="text-lg font-semibold">Number of judicial decisions</h3>
                <p className="text-2xl font-bold">{data.length}</p>
              </div>
              <div className="p-4 bg-gray-100 rounded-lg shadow">
                <h3 className="text-lg font-semibold">Fields in schema</h3>
                <p className="text-2xl font-bold">{Object.keys(data[0] || {}).length}</p>
                <p className="text-sm">
                  Each field represents a piece of information extracted from each judgment. This enables us to transform unstructured court decisions into structured or semi-structured formats, allowing us to aggregate, slice and dice, and analyze the data effectively.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sample Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">
            The sample data below is a subset of attributes/fields from the schema. Each column represents a separate field from the schema.
          </p>
          <DataTable columns={columns} data={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visualizations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium mb-2">Select one of the extracted data fields (from extraction schema) for visualization:</p>
              <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_wyroku">data_wyroku</SelectItem>
                  <SelectItem value="wynik_sprawy">wynik_sprawy</SelectItem>
                  <SelectItem value="apelacja">apelacja</SelectItem>
                  <SelectItem value="typ_sadu">typ_sadu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-[600px] xl:h-[700px] 2xl:h-[800px] border rounded-lg overflow-y-auto">
              {chartData.length > 0 && (
                <ChartContainer config={chartConfig} className="h-full">
                  <BarChart data={chartData} accessibilityLayer stackOffset="expand">
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      label={{ value: "Year of Judgment", position: "insideBottom", offset: -10 }}
                    />
                    <YAxis
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                      label={{ value: `Percentage of ${selectedColumn}`, angle: -90, position: "insideLeft", offset: -10 }}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-2 border rounded shadow">
                              <p className="font-bold">{label}</p>
                              {payload.map((entry, index) => (
                                <p key={index} style={{ color: entry.color }}>
                                  {entry.name}: {(Number(entry.value) || 0).toFixed(1)}%
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {Object.keys(chartData[0]?.values || {}).map((valueKey, index) => (
                      <Bar
                        key={valueKey}
                        dataKey={`values.${valueKey}`}
                        stackId="a"
                        fill={distinctColors[index % distinctColors.length]}
                        radius={index === 0 ? [4, 4, 0, 0] : 0}
                        name={valueKey}
                      />
                    ))}
                    <ReferenceLine
                      x="2019"
                      stroke="#ff0000"
                      strokeWidth={4}
                      label={{
                        value: "Dziubak TSUE judgment",
                        fill: "#000000",
                        fontSize: 12,
                        fontWeight: "bold",
                        offset: 15
                      }}
                    />
                    <Legend verticalAlign="top" align="center" layout="horizontal" />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
            <p className="text-sm mt-4">
              The bar chart above visualizes the percentage distribution of the selected data field over the years. Each bar represents a year, and the segments within each bar show the percentage distribution of different values for the selected field. The red reference line marks the year 2019, highlighting the Dziubak TSUE judgment, which had a significant impact on judicial decisions.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Debug: Display chart data in the UI */}
      <Card className="group">
        <CardHeader className="cursor-pointer" onClick={() => setDebugVisible(!debugVisible)}>
          <CardTitle className="flex items-center justify-between">
            Chart Data Debug
            <span className="text-sm text-muted-foreground">
              {debugVisible ? "Hide" : "Show"}
            </span>
          </CardTitle>
        </CardHeader>
        {debugVisible && (
          <CardContent>
            <div className="max-h-[200px] overflow-auto">
              <pre className="text-xs">{JSON.stringify(chartData, null, 2)}</pre>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Schema / Encoding</CardTitle>
        </CardHeader>
        <CardContent>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Show Schema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="show">Show Schema</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
