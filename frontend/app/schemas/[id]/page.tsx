'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ExtractionSchema } from '@/types/extraction_schemas';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { List, Code, FileJson, Table as TableIcon, Palette, Download, Trash2, ArrowLeft, Copy, Calendar, Clock, User, Play } from 'lucide-react';
import YAML from 'yaml';
import { parseSchemaToFields, flattenSchemaFields, parseSchemaText, getFieldTypeLabel, formatSchemaFieldName } from '@/lib/schema-utils';
import { SchemaFieldsTable } from '@/components/schemas/SchemaFieldsTable';
import { SchemaPreview } from '@/lib/styles/components/schemas/SchemaPreview';
import { useAuth } from '@/contexts/AuthContext';
import {
 PageContainer,
 LightCard,
 SecondaryButton,
 AccentButton,
 LoadingIndicator,
 ErrorCard,
 Badge,
 AIBadge,
 SubsectionHeader,
 SchemaStatusBadge,
 VerifiedBadge,
} from '@/lib/styles/components';
import { cn } from '@/lib/utils';
import { SchemaStatus } from '@/types/extraction_schemas';

export default function SchemaDetailPage() {
 const params = useParams();
 const router = useRouter();
 const { user } = useAuth();
 const schemaId = params.id as string;

 const [schema, setSchema] = useState<ExtractionSchema | null>(null);
 const [loading, setLoading] = useState(true);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [showRawSchema, setShowRawSchema] = useState(false);
 const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);

 const fetchSchema = useCallback(async () => {
 if (!schemaId) return;

 try {
 setLoading(true);
 const response = await fetch(`/api/schemas/${schemaId}`);
 if (!response.ok) {
 if (response.status === 404) {
 throw new Error('Schema not found');
 }
 throw new Error('Failed to fetch schema');
 }
 const data = await response.json();
 setSchema(data);
 } catch (err) {
 setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
 toast.error("Failed to fetch schema");
 } finally {
 setLoading(false);
 }
 }, [schemaId]);

 useEffect(() => {
 fetchSchema();
 }, [fetchSchema]);

 // Format date for display
 const formatDate = (dateString: string) => {
 const date = new Date(dateString);
 return date.toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 });
 };

 const handleOpenInStudio = () => {
 if (!schema) return;
 router.push(`/schema-chat?schemaId=${schema.id}`);
 };

 const handleDuplicate = () => {
 if (!schema) return;
 router.push(`/schema-chat?schemaId=${schema.id}&duplicate=true`);
 };

 const handleExportSchema = () => {
 if (!schema) return;

 const schemaData = {
 name: schema.name,
 description: schema.description,
 type: schema.type,
 category: schema.category,
 schema: schema.text,
 dates: schema.dates,
 };

 const dataStr = JSON.stringify(schemaData, null, 2);
 const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
 const exportFileDefaultName = `${schema.name.replace(/\s+/g, '_')}_schema.json`;

 const linkElement = document.createElement('a');
 linkElement.setAttribute('href', dataUri);
 linkElement.setAttribute('download', exportFileDefaultName);
 linkElement.click();

 toast.success(`Schema exported as ${exportFileDefaultName}`);
 };

 const handleDeleteClick = () => {
 setDeleteDialogOpen(true);
 };

 const handleDeleteConfirm = async () => {
 if (!schema) return;

 setIsDeleting(true);
 try {
 const response = await fetch(`/api/schemas?id=${schema.id}`, {
 method: 'DELETE',
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to delete schema');
 }

 toast.success(`Schema"${schema.name}"has been deleted`);

 router.push('/schemas');
 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'An error occurred';
 toast.error(`Failed to delete schema: ${errorMessage}`);
 } finally {
 setIsDeleting(false);
 setDeleteDialogOpen(false);
 }
 };

 // Check if schema belongs to current user
 const isSchemaOwner = (): boolean => {
 if (!user || !schema?.user_id) return false;
 return schema.user_id === user.id;
 };

 if (loading) {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <LoadingIndicator
 message="Loading schema..."
 subtitle="Fetching schema details"
 subtitleIcon={FileJson}
 variant="centered"
 size="lg"
 />
 </PageContainer>
 );
 }

 if (errorMessage || !schema) {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <ErrorCard
 title="Failed to Load Schema"
 message={errorMessage || 'Schema not found'}
 onRetry={fetchSchema}
 />
 </PageContainer>
 );
 }

 return (
 <PageContainer fillViewport>
 {/* Back Button */}
 <div className="mb-6">
 <SecondaryButton
 icon={ArrowLeft}
 onClick={() => router.push('/schemas')}
 >
 Back to Schemas
 </SecondaryButton>
 </div>

 <LightCard
 padding="lg"
 showBorder={true}
 showShadow={false}
 className="hover:shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-200"
 >
 <div className="space-y-4">
 {/* Header */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
 <div className="flex items-center gap-2 flex-wrap">
 <h1 className="text-2xl font-semibold">{schema.name}</h1>
 {schema.status && (
 <SchemaStatusBadge
 status={schema.status as SchemaStatus}
 size="sm"
 />
 )}
 {schema.is_verified && (
 <VerifiedBadge size="sm"/>
 )}
 </div>
 <div className="flex gap-2 flex-wrap shrink-0">
 <SecondaryButton
 size="sm"
 icon={Play}
 onClick={() => router.push(`/extract?schema=${schema.id}`)}
 >
 Configure Extraction
 </SecondaryButton>
 {isSchemaOwner() && (
 <AccentButton
 size="sm"
 icon={Palette}
 onClick={handleOpenInStudio}
 className="!text-foreground font-semibold"
 >
 Edit in Studio
 </AccentButton>
 )}
 <AccentButton
 size="sm"
 icon={Copy}
 onClick={handleDuplicate}
 className="!text-foreground font-semibold"
 >
 Duplicate
 </AccentButton>
 {isSchemaOwner() && (
 <SecondaryButton
 size="sm"
 icon={Trash2}
 onClick={handleDeleteClick}
 className="text-red-600 hover:text-red-700 hover:bg-red-50"
 >
 Delete
 </SecondaryButton>
 )}
 <SecondaryButton
 size="sm"
 icon={Download}
 onClick={handleExportSchema}
 >
 Export
 </SecondaryButton>
 </div>
 </div>

 {/* Description */}
 {schema.description && (
 <p className="text-sm text-foreground/80 leading-relaxed">{schema.description}</p>
 )}

 {/* Metadata */}
 <div className="rounded-lg border border-slate-200/50 backdrop-blur-sm bg-gradient-to-br from-white/40 via-white/30 to-white/20 p-4 space-y-4">
 <div className="flex flex-wrap gap-6 text-sm">
 <div className="flex items-center gap-2 text-foreground/70">
 <Calendar className="h-4 w-4 text-muted-foreground"/>
 <span className="font-medium">Created:</span>
 <span className="text-foreground/80">{formatDate(schema.created_at)}</span>
 </div>
 <div className="flex items-center gap-2 text-foreground/70">
 <Clock className="h-4 w-4 text-muted-foreground"/>
 <span className="font-medium">Updated:</span>
 <span className="text-foreground/80">{formatDate(schema.updated_at)}</span>
 </div>
 {schema.user?.email && (
 <div className="flex items-center gap-2 text-foreground/70">
 <User className="h-4 w-4 text-muted-foreground"/>
 <span className="font-medium">Created by:</span>
 <span className="text-foreground/80">{schema.user.email}</span>
 </div>
 )}
 </div>
 </div>

 {/* Schema Content */}
 <div className="pt-4 border-t border-slate-200/50">
 <div className="mb-4">
 <h2 className="font-bold text-lg text-foreground">Schema Content</h2>
 </div>
 <Tabs defaultValue="table"className="w-full">
 <TabsList className="hidden">
 <TabsTrigger value="fields"className="flex items-center gap-2"disabled>
 <List className="h-4 w-4"/>
 Fields
 </TabsTrigger>
 <TabsTrigger value="table"className="flex items-center gap-2">
 <TableIcon className="h-4 w-4"/>
 Table
 </TabsTrigger>
 <TabsTrigger value="json"className="flex items-center gap-2"disabled>
 <Code className="h-4 w-4"/>
 JSON
 </TabsTrigger>
 <TabsTrigger value="yaml"className="flex items-center gap-2"disabled>
 <FileJson className="h-4 w-4"/>
 YAML
 </TabsTrigger>
 </TabsList>

 <TabsContent value="table"className="mt-4">
 <div className="w-full">
 <SchemaFieldsTable
 fields={flattenSchemaFields(parseSchemaToFields(schema.text))}
 />
 </div>
 </TabsContent>

 <TabsContent value="json"className="mt-4">
 <ScrollArea className="h-[400px] max-h-[50vh] w-full border rounded-md bg-slate-50/50 border-slate-200/50">
 <pre className="text-sm whitespace-pre-wrap p-4 font-mono">
 {JSON.stringify(schema.text, null, 2)}
 </pre>
 </ScrollArea>
 </TabsContent>

 <TabsContent value="yaml"className="mt-4">
 <ScrollArea className="h-[400px] max-h-[50vh] w-full border rounded-md bg-slate-50/50 border-slate-200/50">
 <pre className="text-sm whitespace-pre-wrap p-4 font-mono">
 {YAML.stringify(schema.text)}
 </pre>
 </ScrollArea>
 </TabsContent>
 </Tabs>
 </div>

 {/* Schema Preview */}
 <SchemaPreview schema={schema} />
 </div>
 </LightCard>

 {/* Delete Confirmation Dialog */}
 <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete Schema</AlertDialogTitle>
 <AlertDialogDescription>
 Are you sure you want to delete &quot;{schema.name}&quot;? This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleDeleteConfirm}
 disabled={isDeleting}
 className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
 >
 {isDeleting ? 'Deleting...' : 'Delete'}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </PageContainer>
 );
}
