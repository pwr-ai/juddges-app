/**
 * Extraction Table View Component
 * Displays extraction results from multiple documents in a table format
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

interface ExtractionTableViewProps {
  results: Array<{
    document_id: string;
    document_title?: string;
    extracted_data: Record<string, any>;
    status: string;
  }>;
  schema?: {
    properties: Record<string, any>;
  };
}

export function ExtractionTableView({ results, schema }: ExtractionTableViewProps) {
  // Extract all unique field names from schema and results
  const fieldNames = React.useMemo(() => {
    const fields = new Set<string>();

    // From schema
    if (schema?.properties) {
      Object.keys(schema.properties).forEach(key => fields.add(key));
    }

    // From actual results (in case schema is missing)
    results.forEach(result => {
      Object.keys(result.extracted_data || {}).forEach(key => fields.add(key));
    });

    return Array.from(fields);
  }, [results, schema]);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied', {
      description: 'Copied to clipboard'
    });
  };

  const exportToCSV = () => {
    const headers = ['Document ID', 'Status', ...fieldNames];
    const rows = results.map(result => [
      result.document_id,
      result.status,
      ...fieldNames.map(field => formatValue(result.extracted_data?.[field]))
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extraction-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Exported', {
      description: 'Downloaded CSV file'
    });
  };

  const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const normalized = status.toLowerCase();
    if (normalized === 'completed' || normalized === 'success') return 'default';
    if (normalized === 'failed' || normalized === 'error') return 'destructive';
    return 'secondary';
  };

  return (
    <div className="space-y-4">
      {/* Export button */}
      <div className="flex justify-end">
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export to CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Document</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              {fieldNames.map(field => (
                <TableHead key={field} className="min-w-[150px]">
                  {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </TableHead>
              ))}
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, idx) => (
              <TableRow key={result.document_id || idx}>
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-1">
                    <span className="truncate max-w-[200px]">
                      {result.document_title || result.document_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {result.document_id.slice(0, 8)}...
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(result.status)}>
                    {result.status}
                  </Badge>
                </TableCell>
                {fieldNames.map(field => (
                  <TableCell key={field}>
                    {formatValue(result.extracted_data?.[field])}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(
                        JSON.stringify(result.extracted_data, null, 2)
                      )}
                      title="Copy data"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/documents/${result.document_id}`, '_blank')}
                      title="Open document"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
