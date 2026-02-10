'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FileText, Database, Globe, Calendar, RefreshCw, Eye } from 'lucide-react';
import { DocumentDialog } from '@/lib/styles/components';
import { SearchDocument } from '@/types/search';

interface ExtendedSearchDocument extends Omit<SearchDocument, 'issuing_body' | 'legal_references' | 'legal_concepts' | 'thesis'> {
  full_text_preview?: string;
  issuing_body?: {
    name: string;
    jurisdiction?: string;
    type?: string;
  } | string | null;
  legal_references?: Array<{ text: string; ref_type?: string }> | string[];
  legal_concepts?: Array<{ concept_name: string; concept_type?: string }> | string[];
  thesis?: string;
}

interface Statistics {
  totalDocuments: number | null;
  totalChunks: number | null;
  documentTypes: Array<{ type: string; count: number }> | null;
  countries: Array<{ country: string; count: number }> | null;
  sampleDocument?: ExtendedSearchDocument | null;
  errors?: string[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function StatisticsPage() {
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleDocumentLoading, setSampleDocumentLoading] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [precomputeLoading, setPrecomputeLoading] = useState(false);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        const response = await fetch('/api/statistics');
        if (!response.ok) {
          throw new Error('Failed to fetch statistics');
        }
        const data = await response.json();
        setStatistics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStatistics();
  }, []);

  const fetchNewSampleDocument = async () => {
    if (!statistics) return;

    setSampleDocumentLoading(true);
    try {
      const response = await fetch('/api/statistics/sample-document');
      if (!response.ok) {
        throw new Error('Failed to fetch sample document');
      }
      const data = await response.json();
      setStatistics({
        ...statistics,
        sampleDocument: data.sampleDocument
      });
    } catch (err) {
      console.error('Error fetching sample document:', err);
    } finally {
      setSampleDocumentLoading(false);
    }
  };

  const precomputeStatistics = async () => {
    setPrecomputeLoading(true);
    try {
      const response = await fetch('/api/statistics/precompute?clearCache=true', {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to precompute statistics');
      }
      // Refresh the statistics after precomputation
      const statsResponse = await fetch('/api/statistics');
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        setStatistics(data);
      }
    } catch (err) {
      console.error('Error precomputing statistics:', err);
    } finally {
      setPrecomputeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1800px]">
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded-lg animate-pulse mb-2"></div>
          <div className="h-4 bg-gray-200 rounded-lg animate-pulse w-3/4"></div>
        </div>

        {/* Animated Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-4 w-4 bg-gray-200 rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Animated Chart Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-32"></div>
              </CardHeader>
              <CardContent>
                <div className="h-72 bg-gray-200 rounded-lg flex items-center justify-center">
                  <div className="flex space-x-2">
                    <div className="w-2 h-16 bg-gray-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-16 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-16 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-16 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>


        {/* Loading message with animated dots */}
        <div className="flex items-center justify-center mt-8">
          <div className="flex items-center space-x-2 text-lg text-gray-600">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="ml-2">Loading statistics</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1800px]">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1800px]">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Database Statistics</h1>
            <p className="text-gray-600">Overview of indexed documents and chunks in the legal database</p>
          </div>
          <Button
            onClick={precomputeStatistics}
            disabled={precomputeLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${precomputeLoading ? 'animate-spin' : ''}`} />
            {precomputeLoading ? 'Precomputing...' : 'Refresh Statistics'}
          </Button>
        </div>

        {/* Error Notice */}
        {statistics.errors && statistics.errors.length > 0 && (
          <div className={`mt-4 p-4 rounded-lg ${statistics.errors.includes('weaviate_connection')
              ? 'bg-red-50 border border-red-200'
              : 'bg-yellow-50 border border-yellow-200'
            }`}>
            <h3 className={`text-sm font-medium mb-2 ${statistics.errors.includes('weaviate_connection')
                ? 'text-red-800'
                : 'text-yellow-800'
              }`}>
              {statistics.errors.includes('weaviate_connection')
                ? 'Database connection unavailable'
                : 'Some statistics are temporarily unavailable'}
            </h3>
            <p className={`text-sm ${statistics.errors.includes('weaviate_connection')
                ? 'text-red-700'
                : 'text-yellow-700'
              }`}>
              {statistics.errors.includes('weaviate_connection')
                ? 'Unable to connect to the Weaviate database. Please ensure the database is running and accessible.'
                : `The following data couldn't be loaded: ${statistics.errors.map(error =>
                  error.replace('_', ' ')).join(', ')}. Available data is shown below.`}
            </p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 mb-8">
        {statistics.totalDocuments !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalDocuments.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Legal documents indexed</p>
            </CardContent>
          </Card>
        )}

        {statistics.totalChunks !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Chunks</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalChunks.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Document chunks for search</p>
            </CardContent>
          </Card>
        )}

        {statistics.documentTypes !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Document Types</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.documentTypes.length}</div>
              <p className="text-xs text-muted-foreground">Different document types</p>
            </CardContent>
          </Card>
        )}

        {statistics.countries !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Countries</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.countries.length}</div>
              <p className="text-xs text-muted-foreground">Countries represented</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      {(statistics.documentTypes !== null || statistics.countries !== null) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* Document Types Chart */}
          {statistics.documentTypes !== null && statistics.documentTypes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Document Types Distribution</CardTitle>
                <CardDescription>Breakdown of documents by type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statistics.documentTypes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => {
                        const payload = props.payload as { type: string; count: number } | undefined;
                        return payload ? `${payload.type}: ${payload.count}` : '';
                      }}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {statistics.documentTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Countries Chart */}
          {statistics.countries !== null && statistics.countries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Countries Distribution</CardTitle>
                <CardDescription>Documents by country</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statistics.countries.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* No Data Available Message */}
      {statistics.totalDocuments === null &&
        statistics.totalChunks === null &&
        statistics.documentTypes === null &&
        statistics.countries === null &&
        !statistics.sampleDocument && (
          <Card className="mb-8">
            <CardContent className="flex items-center justify-center h-64">
              <div className="text-center">
                <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Statistics Temporarily Unavailable
                </h3>
                <p className="text-gray-600">
                  We&apos;re having trouble connecting to the database. Please try refreshing the page.
                </p>
              </div>
            </CardContent>
          </Card>
        )}


      {/* Sample Document - All Properties */}
      {statistics.sampleDocument && (
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sample Document - All Properties</CardTitle>
              <CardDescription>Complete view of all document properties and their values</CardDescription>
            </div>
            <Button
              onClick={fetchNewSampleDocument}
              disabled={sampleDocumentLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${sampleDocumentLoading ? 'animate-spin' : ''}`} />
              {sampleDocumentLoading ? 'Loading...' : 'New Sample'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Basic Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Document ID</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.document_id || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Document Type</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.document_type || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Country</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.country || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Language</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.language || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Date Issued</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.date_issued || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Document Number</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.document_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Title Section */}
              {statistics.sampleDocument.title && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Title</h3>
                  <p className="text-sm text-gray-800 font-medium">{statistics.sampleDocument.title}</p>
                </div>
              )}

              {/* Issuing Authority Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Issuing Authority</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Issuing Body</h4>
                    <p className="text-sm text-gray-800">
                      {statistics.sampleDocument.issuing_body
                        ? (typeof statistics.sampleDocument.issuing_body === 'string'
                          ? statistics.sampleDocument.issuing_body
                          : `${statistics.sampleDocument.issuing_body?.name}${statistics.sampleDocument.issuing_body?.jurisdiction ? ` (${statistics.sampleDocument.issuing_body.jurisdiction})` : ''}`)
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Court Name</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.court_name || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Department</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.department_name || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Judicial Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Judicial Information</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Presiding Judge</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.presiding_judge || 'N/A'}</p>
                  </div>
                  {statistics.sampleDocument.judges && statistics.sampleDocument.judges.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Judges ({statistics.sampleDocument.judges.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.judges.map((judge: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-amber-100 text-amber-800 rounded-md text-xs">
                            {judge}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Parties</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.parties || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Outcome</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.outcome || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Content Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Content</h3>
                <div className="space-y-3">
                  {statistics.sampleDocument.summary && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Summary</h4>
                      <p className="text-sm text-gray-700 mt-1 p-3 bg-gray-50 rounded-lg">{statistics.sampleDocument.summary}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.thesis && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Thesis</h4>
                      <p className="text-sm text-gray-700 mt-1 p-3 bg-gray-50 rounded-lg">{statistics.sampleDocument.thesis}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.factual_state && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Factual State (Stan Faktyczny)</h4>
                      <p className="text-sm text-gray-700 mt-1 p-3 bg-blue-50 rounded-lg border border-blue-200">{statistics.sampleDocument.factual_state}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.legal_state && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Legal State (Stan Prawny)</h4>
                      <p className="text-sm text-gray-700 mt-1 p-3 bg-green-50 rounded-lg border border-green-200">{statistics.sampleDocument.legal_state}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.full_text && (
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm text-gray-600">Full Text (Preview)</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => setDocumentDialogOpen(true)}
                        >
                          <Eye className="h-4 w-4" />
                          View Full Text
                        </Button>
                      </div>
                      <div className="text-sm text-gray-700 mt-1 p-4 bg-gray-50 rounded-lg max-h-48 overflow-y-auto">
                        {statistics.sampleDocument.full_text_preview ||
                          (statistics.sampleDocument.full_text?.length > 300
                            ? statistics.sampleDocument.full_text.substring(0, 300) + '...'
                            : statistics.sampleDocument.full_text)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Legal References Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Legal References & Bases</h3>
                <div className="space-y-3">
                  {statistics.sampleDocument.legal_references && Array.isArray(statistics.sampleDocument.legal_references) && statistics.sampleDocument.legal_references.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Legal References ({statistics.sampleDocument.legal_references.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.legal_references.map((ref: { text?: string } | string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs">
                            {typeof ref === 'string' ? ref : ref.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {statistics.sampleDocument.legal_bases && statistics.sampleDocument.legal_bases.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Legal Bases ({statistics.sampleDocument.legal_bases.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.legal_bases.map((base: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                            {base}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {statistics.sampleDocument.extracted_legal_bases && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Extracted Legal Bases</h4>
                      <p className="text-sm text-gray-800">{statistics.sampleDocument.extracted_legal_bases}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.references && statistics.sampleDocument.references.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">References ({statistics.sampleDocument.references.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.references.map((ref: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-md text-xs">
                            {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Keywords & Concepts Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Keywords & Concepts</h3>
                <div className="space-y-3">
                  {statistics.sampleDocument.keywords && statistics.sampleDocument.keywords.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Keywords ({statistics.sampleDocument.keywords.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.keywords.map((keyword, index) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {statistics.sampleDocument.legal_concepts && Array.isArray(statistics.sampleDocument.legal_concepts) && statistics.sampleDocument.legal_concepts.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Legal Concepts ({statistics.sampleDocument.legal_concepts.length})</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {statistics.sampleDocument.legal_concepts.map((concept: { concept_name?: string; concept_type?: string } | string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-xs">
                            {typeof concept === 'string' ? concept : `${concept.concept_name}${concept.concept_type ? ` (${concept.concept_type})` : ''}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Metadata & Processing</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Processing Status</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata?.processing_status || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Publication Date</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata?.publication_date || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Ingestion Date</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata?.ingestion_date || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Last Updated</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata?.last_updated || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600">Source</h4>
                    <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata?.source || 'N/A'}</p>
                  </div>
                  {statistics.sampleDocument.metadata?.source_url && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Source URL</h4>
                      <a
                        href={statistics.sampleDocument.metadata.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all"
                      >
                        Link
                      </a>
                    </div>
                  )}
                  {(statistics.sampleDocument.metadata?.x !== undefined && statistics.sampleDocument.metadata?.x !== null) && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">X Coordinate</h4>
                      <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata.x}</p>
                    </div>
                  )}
                  {(statistics.sampleDocument.metadata?.y !== undefined && statistics.sampleDocument.metadata?.y !== null) && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Y Coordinate</h4>
                      <p className="text-sm text-gray-800">{statistics.sampleDocument.metadata.y}</p>
                    </div>
                  )}
                  {statistics.sampleDocument.score !== null && statistics.sampleDocument.score !== undefined && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600">Score</h4>
                      <p className="text-sm text-gray-800">{statistics.sampleDocument.score}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Raw Content Section (if available) */}
              {statistics.sampleDocument.metadata?.raw_content && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 pb-2 border-b border-gray-200">Raw Content (Preview)</h3>
                  <div className="text-sm text-gray-700 mt-1 p-4 bg-gray-50 rounded-lg max-h-48 overflow-y-auto">
                    {statistics.sampleDocument.metadata.raw_content.length > 500
                      ? statistics.sampleDocument.metadata.raw_content.substring(0, 500) + '...'
                      : statistics.sampleDocument.metadata.raw_content}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Dialog */}
      {statistics.sampleDocument && (
        <DocumentDialog
          isOpen={documentDialogOpen}
          onClose={setDocumentDialogOpen}
          document={statistics.sampleDocument as SearchDocument}
          chunks={[]}
        />
      )}
    </div>
  );
}
