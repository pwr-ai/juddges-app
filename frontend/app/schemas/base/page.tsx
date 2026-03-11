'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Download, FileJson, Globe, Table as TableIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
 PageContainer,
 LightCard,
 SecondaryButton,
 LoadingIndicator,
 ErrorCard,
 Badge,
} from '@/lib/styles/components';
import { cn } from '@/lib/utils';
import { parseSchemaToFields, flattenSchemaFields } from '@/lib/schema-utils';
import { SchemaFieldsTable } from '@/components/schemas/SchemaFieldsTable';
import { useTranslation } from '@/contexts/LanguageContext';

type SchemaLocale = 'en' | 'pl';

interface BaseSchemaDefinitionResponse {
 schema_key: string;
 default_locale: SchemaLocale;
 available_locales: SchemaLocale[];
 schemas: Record<string, Record<string, unknown>>;
}

export default function BaseSchemaPage(): React.JSX.Element {
 const router = useRouter();
 const { locale: appLocale } = useTranslation();
 const [loading, setLoading] = useState(true);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [definition, setDefinition] = useState<BaseSchemaDefinitionResponse | null>(null);
 const [activeLocale, setActiveLocale] = useState<SchemaLocale>('en');

 const fetchDefinition = useCallback(async () => {
 try {
 setLoading(true);
 const response = await fetch('/api/extractions/base-schema/definition', {
 method: 'GET',
 });

 if (!response.ok) {
 throw new Error('Failed to fetch base schema definition');
 }

 const data: BaseSchemaDefinitionResponse = await response.json();
 setDefinition(data);
 setErrorMessage(null);
 } catch (error) {
 const message = error instanceof Error ? error.message : 'An error occurred';
 setErrorMessage(message);
 toast.error('Failed to load base schema definition');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchDefinition();
 }, [fetchDefinition]);

 useEffect(() => {
 setActiveLocale(appLocale === 'pl' ? 'pl' : 'en');
 }, [appLocale]);

 useEffect(() => {
 if (!definition) return;
 const available = new Set(definition.available_locales || []);
 if (!available.has(activeLocale)) {
 setActiveLocale(definition.default_locale || 'en');
 }
 }, [definition, activeLocale]);

 const activeSchema = useMemo(() => {
 if (!definition) return null;
 return (
 definition.schemas?.[activeLocale] ||
 definition.schemas?.[definition.default_locale] ||
 null
 );
 }, [definition, activeLocale]);

 const fieldStats = useMemo(() => {
 if (!activeSchema) return { total: 0, required: 0 };
 const properties = activeSchema.properties as Record<string, unknown> | undefined;
 const required = activeSchema.required as unknown[] | undefined;
 return {
 total: properties ? Object.keys(properties).length : 0,
 required: Array.isArray(required) ? required.length : 0,
 };
 }, [activeSchema]);

 const flattenedFields = useMemo(() => {
 if (!activeSchema) return [];
 return flattenSchemaFields(parseSchemaToFields(activeSchema));
 }, [activeSchema]);

 const schemaJson = useMemo(() => {
 if (!activeSchema) return '';
 return JSON.stringify(activeSchema, null, 2);
 }, [activeSchema]);

 const handleCopyJson = async (): Promise<void> => {
 try {
 await navigator.clipboard.writeText(schemaJson);
 toast.success('Schema JSON copied to clipboard');
 } catch {
 toast.error('Failed to copy schema JSON');
 }
 };

 const handleDownloadJson = (): void => {
 if (!activeSchema) return;
 const blob = new Blob([schemaJson], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = `base-schema-${activeLocale}.json`;
 link.click();
 URL.revokeObjectURL(url);
 toast.success(`Downloaded base-schema-${activeLocale}.json`);
 };

 if (loading) {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <LoadingIndicator
 message="Loading base schema..."
 subtitle="Fetching English and Polish schema variants"
 subtitleIcon={FileJson}
 variant="centered"
 size="lg"
 />
 </PageContainer>
 );
 }

 if (errorMessage || !definition || !activeSchema) {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <ErrorCard
 title="Failed to Load Base Schema"
 message={errorMessage || 'Base schema definition not available'}
 onRetry={fetchDefinition}
 />
 </PageContainer>
 );
 }

 return (
 <PageContainer fillViewport width="wide">
 <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
 <SecondaryButton icon={ArrowLeft} onClick={() => router.push('/schemas')}>
 Back to Schemas
 </SecondaryButton>
 <div className="flex items-center gap-2">
 <SecondaryButton size="sm"icon={Copy} onClick={handleCopyJson}>
 Copy JSON
 </SecondaryButton>
 <SecondaryButton size="sm"icon={Download} onClick={handleDownloadJson}>
 Download JSON
 </SecondaryButton>
 </div>
 </div>

 <LightCard
 padding="lg"
 showBorder={true}
 showShadow={false}
 className="hover:shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-200"
 >
 <div className="space-y-5">
 <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
 <div>
 <h1 className="text-2xl font-semibold">Base Judgment Extraction Schema</h1>
 <p className="mt-1 text-sm text-foreground/80">
 This is the canonical schema used to extract structured information from all judgments added to the app.
 </p>
 </div>
 <Badge variant="outline"className="w-fit">
 {definition.schema_key}
 </Badge>
 </div>

 <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/50 p-3">
 <Globe className="h-4 w-4 text-muted-foreground"/>
 <span className="text-sm text-muted-foreground mr-1">Schema language:</span>
 <button
 type="button"
 onClick={() => setActiveLocale('en')}
 className={cn(
 'rounded-md border px-3 py-1 text-sm transition-colors',
 activeLocale === 'en'
 ? 'bg-primary text-primary-foreground border-primary'
 : 'border-slate-300 hover:bg-muted'
 )}
 >
 English
 </button>
 <button
 type="button"
 onClick={() => setActiveLocale('pl')}
 className={cn(
 'rounded-md border px-3 py-1 text-sm transition-colors',
 activeLocale === 'pl'
 ? 'bg-primary text-primary-foreground border-primary'
 : 'border-slate-300 hover:bg-muted'
 )}
 >
 Polish
 </button>
 <div className="ml-auto flex items-center gap-2 text-xs md:text-sm">
 <Badge variant="secondary">{fieldStats.total} fields</Badge>
 <Badge variant="secondary">{fieldStats.required} required</Badge>
 </div>
 </div>

 <Tabs defaultValue="table"className="w-full">
 <TabsList className="grid w-full grid-cols-2 max-w-sm">
 <TabsTrigger value="table"className="flex items-center gap-2">
 <TableIcon className="h-4 w-4"/>
 Table
 </TabsTrigger>
 <TabsTrigger value="json"className="flex items-center gap-2">
 <FileJson className="h-4 w-4"/>
 JSON
 </TabsTrigger>
 </TabsList>

 <TabsContent value="table"className="mt-4">
 <SchemaFieldsTable fields={flattenedFields} />
 </TabsContent>

 <TabsContent value="json"className="mt-4">
 <ScrollArea className="h-[540px] w-full rounded-md border bg-slate-50/50 border-slate-200/50">
 <pre className="p-4 text-sm whitespace-pre-wrap font-mono">{schemaJson}</pre>
 </ScrollArea>
 </TabsContent>
 </Tabs>
 </div>
 </LightCard>
 </PageContainer>
 );
}
