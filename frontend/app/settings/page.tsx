"use client";

/**
 * Settings Page
 *
 * Centralized location for user preferences and administrative functions
 * that were previously scattered across the navigation
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
 User,
 Bell,
 Shield,
 Database,
 PieChart,
 ArrowRight,
 ExternalLink,
 Settings as SettingsIcon,
 KeyRound,
 Brain,
 Check,
 Loader2,
 AlertCircle,
 Zap,
 Globe,
 Cpu,
} from "lucide-react";
import { Header } from "@/lib/styles/components";

interface EmbeddingModel {
 id: string;
 provider: string;
 model_name: string;
 dimensions: number;
 max_input_length: number;
 description: string;
 is_default: boolean;
 is_active: boolean;
 api_key_configured: boolean;
}

function EmbeddingModelsSection() {
 const [models, setModels] = useState<EmbeddingModel[]>([]);
 const [activeModelId, setActiveModelId] = useState<string>("");
 const [loading, setLoading] = useState(true);
 const [switching, setSwitching] = useState<string | null>(null);
 const [testing, setTesting] = useState<string | null>(null);
 const [testResult, setTestResult] = useState<{ modelId: string; success: boolean; message: string } | null>(null);
 const [error, setError] = useState<string | null>(null);

 const fetchModels = useCallback(async () => {
 try {
 setLoading(true);
 const response = await fetch("/api/embeddings?endpoint=models");
 if (!response.ok) throw new Error("Failed to fetch models");
 const data = await response.json();
 setModels(data.models || []);
 setActiveModelId(data.active_model_id || "");
 setError(null);
 } catch (err) {
 setError("Failed to load embedding models. The backend may be unavailable.");
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchModels();
 }, [fetchModels]);

 const handleSetActive = async (modelId: string) => {
 setSwitching(modelId);
 setTestResult(null);
 try {
 const response = await fetch("/api/embeddings?action=set-active", {
 method: "POST",
 headers: {"Content-Type": "application/json"},
 body: JSON.stringify({ model_id: modelId }),
 });
 if (!response.ok) {
 const err = await response.json().catch(() => ({ detail: "Failed to switch model"}));
 throw new Error(err.detail || "Failed to switch model");
 }
 setActiveModelId(modelId);
 setModels((prev) =>
 prev.map((m) => ({ ...m, is_active: m.id === modelId }))
 );
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to switch model");
 } finally {
 setSwitching(null);
 }
 };

 const handleTestModel = async (modelId: string) => {
 setTesting(modelId);
 setTestResult(null);
 try {
 const response = await fetch("/api/embeddings?action=test", {
 method: "POST",
 headers: {"Content-Type": "application/json"},
 body: JSON.stringify({
 text: "Przepisy dotyczące podatku VAT w kontekście transakcji wewnątrzwspólnotowych",
 model_id: modelId,
 }),
 });
 const data = await response.json();
 if (!response.ok) {
 setTestResult({ modelId, success: false, message: data.detail || "Test failed"});
 } else {
 setTestResult({ modelId, success: true, message: `${data.dimensions}-dim embedding generated` });
 }
 } catch {
 setTestResult({ modelId, success: false, message: "Connection error"});
 } finally {
 setTesting(null);
 }
 };

 const providerIcon = (provider: string) => {
 switch (provider) {
 case"openai": return <Zap className="h-4 w-4"/>;
 case"cohere": return <Globe className="h-4 w-4"/>;
 case"local": return <Cpu className="h-4 w-4"/>;
 default: return <Brain className="h-4 w-4"/>;
 }
 };

 const providerColor = (provider: string) => {
 switch (provider) {
 case"openai": return"bg-green-100 text-green-800";
 case"cohere": return"bg-purple-100 text-purple-800";
 case"local": return"bg-blue-100 text-blue-800";
 default: return"bg-gray-100 text-gray-800";
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/>
 <span className="ml-2 text-sm text-muted-foreground">Loading embedding models...</span>
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {error && (
 <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
 <AlertCircle className="h-4 w-4 flex-shrink-0"/>
 {error}
 </div>
 )}

 {models.map((model) => (
 <div
 key={model.id}
 className={`p-4 rounded-lg border transition-colors ${
 model.is_active
 ? "border-primary bg-primary/5"
 : "border-border hover:border-muted-foreground/30"
 }`}
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-medium">{model.model_name}</span>
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${providerColor(model.provider)}`}>
 {providerIcon(model.provider)}
 {model.provider}
 </span>
 {model.is_active && (
 <Badge variant="default"className="text-xs">
 <Check className="h-3 w-3 mr-1"/>
 Active
 </Badge>
 )}
 {!model.api_key_configured && (
 <Badge variant="outline"className="text-xs text-amber-600 border-amber-300">
 <AlertCircle className="h-3 w-3 mr-1"/>
 API key missing
 </Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
 <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
 <span>{model.dimensions} dimensions</span>
 <span>Max input: {model.max_input_length} chars</span>
 </div>
 {testResult && testResult.modelId === model.id && (
 <div
 className={`mt-2 text-xs px-2 py-1 rounded ${
 testResult.success
 ? "bg-green-50 text-green-700"
 : "bg-red-50 text-red-700"
 }`}
 >
 {testResult.success ? "Test passed": "Test failed"}: {testResult.message}
 </div>
 )}
 </div>
 <div className="flex gap-2 flex-shrink-0">
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleTestModel(model.id)}
 disabled={testing === model.id || !model.api_key_configured}
 >
 {testing === model.id ? (
 <Loader2 className="h-3 w-3 animate-spin mr-1"/>
 ) : null}
 Test
 </Button>
 {!model.is_active && (
 <Button
 variant="default"
 size="sm"
 onClick={() => handleSetActive(model.id)}
 disabled={switching === model.id || !model.api_key_configured}
 >
 {switching === model.id ? (
 <Loader2 className="h-3 w-3 animate-spin mr-1"/>
 ) : null}
 Activate
 </Button>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 );
}

export default function SettingsPage() {
 const { user } = useAuth();

 return (
 <div className="container mx-auto px-6 py-8 max-w-6xl">
 <Header
 icon={SettingsIcon}
 title="Settings"
 size="4xl"
 description="Manage your account preferences and view administrative tools"
 className="mb-8"
 />

 <Tabs defaultValue="account"className="space-y-6">
 <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
 <TabsTrigger value="account">Account</TabsTrigger>
 <TabsTrigger value="preferences">Preferences</TabsTrigger>
 <TabsTrigger value="ai-models">AI Models</TabsTrigger>
 <TabsTrigger value="data">Data & Privacy</TabsTrigger>
 <TabsTrigger value="admin">Administration</TabsTrigger>
 </TabsList>

 {/* Account Settings */}
 <TabsContent value="account"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <User className="h-5 w-5"/>
 Profile Information
 </CardTitle>
 <CardDescription>
 View and manage your account details
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <label className="text-sm font-medium">Email</label>
 <p className="text-sm text-muted-foreground">
 {user?.email || "Not available"}
 </p>
 </div>
 <div className="space-y-2">
 <label className="text-sm font-medium">User ID</label>
 <p className="text-sm text-muted-foreground font-mono">
 {user?.id || "Not available"}
 </p>
 </div>
 <Separator />
 <div className="flex gap-2">
 <Button variant="outline"size="sm">
 Edit Profile
 </Button>
 <Button variant="outline"size="sm">
 Change Password
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Preferences */}
 <TabsContent value="preferences"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Bell className="h-5 w-5"/>
 Notifications
 </CardTitle>
 <CardDescription>
 Configure how you receive updates
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Email notifications</p>
 <p className="text-sm text-muted-foreground">
 Receive updates about your extraction jobs
 </p>
 </div>
 <Button variant="outline"size="sm">
 Configure
 </Button>
 </div>
 <Separator />
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Research updates</p>
 <p className="text-sm text-muted-foreground">
 Get notified about new features and documents
 </p>
 </div>
 <Button variant="outline"size="sm">
 Configure
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Display Preferences</CardTitle>
 <CardDescription>
 Customize your viewing experience
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Theme</p>
 <p className="text-sm text-muted-foreground">
 Currently using system preference
 </p>
 </div>
 <Button variant="outline"size="sm">
 Change
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* AI Models */}
 <TabsContent value="ai-models"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Brain className="h-5 w-5"/>
 Embedding Models
 </CardTitle>
 <CardDescription>
 Configure which embedding model is used for document search and similarity. Different models offer trade-offs between quality, speed, and cost.
 </CardDescription>
 </CardHeader>
 <CardContent>
 <EmbeddingModelsSection />
 </CardContent>
 </Card>

 <Card className="border-blue-200 bg-blue-50/50">
 <CardHeader>
 <CardTitle className="text-blue-900 text-sm">
 About Embedding Models
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <p className="text-sm text-blue-800">
 Embedding models convert text into numerical vectors used for semantic search.
 Switching models affects how new searches are performed but does not re-embed existing documents.
 </p>
 <p className="text-sm text-blue-800">
 <strong>OpenAI</strong> models offer high quality and are the default. <strong>Cohere</strong> models
 provide excellent multilingual support. <strong>Local</strong> models run without API costs and are
 optimized for Polish legal texts.
 </p>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Data & Privacy */}
 <TabsContent value="data"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Shield className="h-5 w-5"/>
 Privacy & Data
 </CardTitle>
 <CardDescription>
 Manage your data and privacy settings
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Download your data</p>
 <p className="text-sm text-muted-foreground">
 Export your collections and search history
 </p>
 </div>
 <Button variant="outline"size="sm">
 <ExternalLink className="h-4 w-4 mr-2"/>
 Export
 </Button>
 </div>
 <Separator />
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Delete account</p>
 <p className="text-sm text-muted-foreground">
 Permanently remove your account and data
 </p>
 </div>
 <Button variant="destructive"size="sm">
 Delete
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Privacy Policy</CardTitle>
 <CardDescription>
 Review our data handling practices
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 Last updated: January 2025
 </p>
 <Button variant="link"size="sm"asChild>
 <Link href="/privacy">
 Read Policy
 <ArrowRight className="h-4 w-4 ml-1"/>
 </Link>
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Administration */}
 <TabsContent value="admin"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Database className="h-5 w-5"/>
 Administrative Tools
 </CardTitle>
 <CardDescription>
 Access advanced features and analytics
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <Link
 href="/statistics"
 className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
 >
 <div className="flex items-center gap-3">
 <PieChart className="h-5 w-5 text-muted-foreground"/>
 <div>
 <p className="font-medium">Database Statistics</p>
 <p className="text-sm text-muted-foreground">
 View metrics and analytics
 </p>
 </div>
 </div>
 <ArrowRight className="h-5 w-5 text-muted-foreground"/>
 </Link>

 <Link
 href="/settings/sso"
 className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
 >
 <div className="flex items-center gap-3">
 <KeyRound className="h-5 w-5 text-muted-foreground"/>
 <div>
 <p className="font-medium">SSO Connections</p>
 <p className="text-sm text-muted-foreground">
 Manage SAML 2.0 and OAuth 2.0 enterprise SSO
 </p>
 </div>
 </div>
 <ArrowRight className="h-5 w-5 text-muted-foreground"/>
 </Link>
 </CardContent>
 </Card>

 <Card className="border-amber-200 bg-amber-50/50">
 <CardHeader>
 <CardTitle className="text-amber-900">
 Research Project Notice
 </CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-amber-800">
 This platform is a research project by Wrocław University of Science and Technology.
 Some administrative features may require special permissions.
 </p>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 );
}
