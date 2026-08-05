"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Brain,
  Check,
  Cpu,
  Globe,
  Loader2,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export function EmbeddingModelsSection({ isAdmin }: { isAdmin: boolean }) {
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [activeModelId, setActiveModelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    modelId: string;
    success: boolean;
    message: string;
  } | null>(null);
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
    } catch {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!response.ok) {
        const responseError = await response
          .json()
          .catch(() => ({ detail: "Failed to switch model" }));
        throw new Error(responseError.detail || "Failed to switch model");
      }
      setActiveModelId(modelId);
      setModels((previous) =>
        previous.map((model) => ({
          ...model,
          is_active: model.id === modelId,
        })),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to switch model",
      );
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Przepisy dotyczące podatku VAT w kontekście transakcji wewnątrzwspólnotowych",
          model_id: modelId,
        }),
      });
      const data = await response.json();
      setTestResult({
        modelId,
        success: response.ok,
        message: response.ok
          ? `${data.dimensions}-dim embedding generated`
          : data.detail || "Test failed",
      });
    } catch {
      setTestResult({ modelId, success: false, message: "Connection error" });
    } finally {
      setTesting(null);
    }
  };

  const providerIcon = (provider: string) => {
    switch (provider) {
      case "openai":
        return <Zap className="h-4 w-4" />;
      case "cohere":
        return <Globe className="h-4 w-4" />;
      case "local":
        return <Cpu className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const providerColor = (provider: string) => {
    switch (provider) {
      case "openai":
        return "bg-green-100 text-green-800";
      case "cohere":
        return "bg-purple-100 text-purple-800";
      case "local":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading embedding models...
        </span>
      </div>
    );
  }

  const isAllowed = (model: EmbeddingModel) =>
    model.model_name === "BAAI/bge-m3";

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          {isAdmin ? (
            <>
              Only <strong>BAAI/bge-m3</strong> can be activated at the moment.
              Other models are listed for reference — in the future we plan to
              investigate how different embeddings perform on Polish legal texts
              and re-enable selection.
            </>
          ) : (
            <>
              Only administrators can change the platform&apos;s active embedding
              model. You can inspect and test the available models.
            </>
          )}
        </span>
      </div>

      {models.map((model) => (
        <div
          key={model.id}
          className={`rounded-lg border p-4 transition-colors ${
            model.is_active
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{model.model_name}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${providerColor(model.provider)}`}
                >
                  {providerIcon(model.provider)}
                  {model.provider}
                </span>
                {model.is_active && (
                  <Badge variant="default" className="text-xs">
                    <Check className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                )}
                {!model.api_key_configured && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 text-xs text-amber-600"
                  >
                    <AlertCircle className="mr-1 h-3 w-3" />
                    API key missing
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {model.description}
              </p>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{model.dimensions} dimensions</span>
                <span>Max input: {model.max_input_length} chars</span>
              </div>
              {testResult?.modelId === model.id && (
                <div
                  className={`mt-2 rounded px-2 py-1 text-xs ${
                    testResult.success
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {testResult.success ? "Test passed" : "Test failed"}: {testResult.message}
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestModel(model.id)}
                disabled={testing === model.id || !model.api_key_configured}
              >
                {testing === model.id && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Test
              </Button>
              {isAdmin && !model.is_active && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleSetActive(model.id)}
                  disabled={
                    switching === model.id ||
                    !model.api_key_configured ||
                    !isAllowed(model)
                  }
                  title={
                    !isAllowed(model)
                      ? "Only BAAI/bge-m3 can be activated right now"
                      : undefined
                  }
                >
                  {switching === model.id && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
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
