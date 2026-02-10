"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useExperimentStore } from "@/lib/store/experimentStore";
import type {
  Experiment,
  ExperimentStatus,
  CreateExperimentInput,
  FeatureArea,
  ExperimentType,
} from "@/types/experiments";
import { Button } from "@/components/ui/button";
import {
  FlaskConical,
  Plus,
  Play,
  Pause,
  CheckCircle,
  Archive,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Users,
  Target,
  Calendar,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

const STATUS_COLORS: Record<ExperimentStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  running: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

const STATUS_ICONS: Record<ExperimentStatus, React.ReactNode> = {
  draft: <FlaskConical className="h-3.5 w-3.5" />,
  running: <Play className="h-3.5 w-3.5" />,
  paused: <Pause className="h-3.5 w-3.5" />,
  completed: <CheckCircle className="h-3.5 w-3.5" />,
  archived: <Archive className="h-3.5 w-3.5" />,
};

function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_ICONS[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function CreateExperimentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: CreateExperimentInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [experimentType, setExperimentType] = useState<ExperimentType>("ab_test");
  const [featureArea, setFeatureArea] = useState<FeatureArea | "">("");
  const [primaryMetric, setPrimaryMetric] = useState("conversion");
  const [controlName, setControlName] = useState("Control");
  const [treatmentName, setTreatmentName] = useState("Treatment");
  const [controlWeight, setControlWeight] = useState(50);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      hypothesis: hypothesis || undefined,
      experiment_type: experimentType,
      feature_area: featureArea ? (featureArea as FeatureArea) : undefined,
      primary_metric: primaryMetric,
      variants: [
        { name: controlName, is_control: true, weight: controlWeight },
        { name: treatmentName, is_control: false, weight: 100 - controlWeight },
      ],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border border-border rounded-lg bg-card">
      <h3 className="text-lg font-semibold">Create New Experiment</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            placeholder="e.g., Search Results Layout v2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={experimentType}
            onChange={(e) => setExperimentType(e.target.value as ExperimentType)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="ab_test">A/B Test</option>
            <option value="multivariate">Multivariate</option>
            <option value="feature_flag">Feature Flag</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          placeholder="What does this experiment test?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hypothesis</label>
        <textarea
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          placeholder="If we change X, then Y will improve by Z%"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Feature Area</label>
          <select
            value={featureArea}
            onChange={(e) => setFeatureArea(e.target.value as FeatureArea | "")}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="">Select area...</option>
            <option value="ui">UI</option>
            <option value="search">Search</option>
            <option value="chat">Chat</option>
            <option value="prompts">Prompts</option>
            <option value="navigation">Navigation</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Primary Metric</label>
          <input
            type="text"
            value={primaryMetric}
            onChange={(e) => setPrimaryMetric(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            placeholder="e.g., conversion, click_rate, time_on_page"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold mb-3">Variants</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Control Name</label>
            <input
              type="text"
              value={controlName}
              onChange={(e) => setControlName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Treatment Name</label>
            <input
              type="text"
              value={treatmentName}
              onChange={(e) => setTreatmentName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Traffic Split (Control: {controlWeight}% / Treatment: {100 - controlWeight}%)
            </label>
            <input
              type="range"
              min={10}
              max={90}
              value={controlWeight}
              onChange={(e) => setControlWeight(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Create Experiment
        </Button>
      </div>
    </form>
  );
}

function ExperimentResultsView({ experimentId }: { experimentId: string }) {
  const { results, isLoading, fetchExperimentResults } = useExperimentStore();

  useEffect(() => {
    fetchExperimentResults(experimentId);
  }, [experimentId, fetchExperimentResults]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading results...</span>
      </div>
    );
  }

  if (!results || results.experiment_id !== experimentId) {
    return (
      <div className="text-sm text-muted-foreground py-4">No results available yet.</div>
    );
  }

  const controlVariant = results.variants.find((v) => v.is_control);
  const treatmentVariants = results.variants.filter((v) => !v.is_control);

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Total participants: {results.total_participants}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.variants.map((v) => (
          <div
            key={v.variant_id}
            className={`p-4 rounded-lg border ${
              v.is_control
                ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30"
                : "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{v.variant_name}</span>
              {v.is_control && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  Control
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Users</div>
                <div className="font-semibold">{v.total_users}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Events</div>
                <div className="font-semibold">{v.total_events}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Conversions</div>
                <div className="font-semibold">{v.conversion_count}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Rate</div>
                <div className="font-semibold flex items-center gap-1">
                  {v.conversion_rate}%
                  {!v.is_control && controlVariant && v.conversion_rate > controlVariant.conversion_rate && (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  )}
                </div>
              </div>
            </div>
            {v.avg_event_value !== null && (
              <div className="mt-2 text-xs text-muted-foreground">
                Avg value: {v.avg_event_value}
              </div>
            )}
          </div>
        ))}
      </div>

      {controlVariant && treatmentVariants.length > 0 && (
        <div className="p-3 rounded-lg bg-muted/50 text-sm">
          <span className="font-medium">Lift: </span>
          {treatmentVariants.map((t) => {
            const lift =
              controlVariant.conversion_rate > 0
                ? ((t.conversion_rate - controlVariant.conversion_rate) /
                    controlVariant.conversion_rate) *
                  100
                : 0;
            return (
              <span key={t.variant_id} className={lift > 0 ? "text-green-600" : "text-red-600"}>
                {t.variant_name}: {lift > 0 ? "+" : ""}
                {lift.toFixed(1)}%
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const [expanded, setExpanded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const { updateExperimentStatus } = useExperimentStore();

  const variants = experiment.experiment_variants || [];

  const handleStatusChange = (newStatus: ExperimentStatus) => {
    updateExperimentStatus(experiment.id, newStatus);
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-sm truncate">{experiment.name}</h3>
              <StatusBadge status={experiment.status} />
              {experiment.feature_area && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                  {experiment.feature_area}
                </span>
              )}
            </div>
            {experiment.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">{experiment.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {variants.length} variants
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(experiment.created_at).toLocaleDateString()}
              </span>
              <span>{experiment.experiment_type.replace("_", " ")}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {experiment.hypothesis && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Hypothesis</h4>
              <p className="text-sm">{experiment.hypothesis}</p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Variants</h4>
            <div className="space-y-2">
              {variants.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.name}</span>
                    {v.is_control && (
                      <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        control
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{v.weight}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {experiment.status === "draft" && (
              <Button size="sm" variant="default" onClick={() => handleStatusChange("running")}>
                <Play className="h-3.5 w-3.5 mr-1" /> Start
              </Button>
            )}
            {experiment.status === "running" && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("paused")}>
                  <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("completed")}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete
                </Button>
              </>
            )}
            {experiment.status === "paused" && (
              <Button size="sm" variant="default" onClick={() => handleStatusChange("running")}>
                <Play className="h-3.5 w-3.5 mr-1" /> Resume
              </Button>
            )}
            {(experiment.status === "completed" || experiment.status === "paused") && (
              <Button size="sm" variant="ghost" onClick={() => handleStatusChange("archived")}>
                <Archive className="h-3.5 w-3.5 mr-1" /> Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowResults(!showResults);
              }}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> {showResults ? "Hide" : "View"} Results
            </Button>
          </div>

          {showResults && <ExperimentResultsView experimentId={experiment.id} />}
        </div>
      )}
    </div>
  );
}

export default function ExperimentsPage() {
  const { user } = useAuth();
  const { experiments, isLoading, error, fetchExperiments, clearError } = useExperimentStore();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { createExperiment } = useExperimentStore();

  useEffect(() => {
    if (user) {
      fetchExperiments(statusFilter || undefined);
    }
  }, [user, statusFilter, fetchExperiments]);

  const handleCreate = useCallback(
    async (input: CreateExperimentInput) => {
      const result = await createExperiment(input);
      if (result) {
        setShowCreate(false);
      }
    },
    [createExperiment]
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please sign in to manage experiments.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6" />
            Experiments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A/B tests, feature flags, and multivariate experiments
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4 mr-1" /> New Experiment
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={clearError} className="ml-auto underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <CreateExperimentForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {["", "draft", "running", "paused", "completed", "archived"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading experiments...</span>
        </div>
      ) : experiments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No experiments yet</p>
          <p className="text-sm mt-1">Create your first experiment to start testing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <ExperimentCard key={exp.id} experiment={exp} />
          ))}
        </div>
      )}
    </div>
  );
}
