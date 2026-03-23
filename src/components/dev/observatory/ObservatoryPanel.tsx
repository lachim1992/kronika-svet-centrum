import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Users, EyeOff, Database, FileSearch, Activity } from "lucide-react";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SystemGraphPanel = lazy(() => import("./SystemGraphPanel"));
const AgencyMapPanel = lazy(() => import("./AgencyMapPanel"));
const HiddenMetricsPanel = lazy(() => import("./HiddenMetricsPanel"));
const DBSchemaPanel = lazy(() => import("./DBSchemaPanel"));
const DataFlowAuditPanel = lazy(() => import("./DataFlowAuditPanel"));
const LiveMetricsPanel = lazy(() => import("./LiveMetricsPanel"));

const Fallback = () => <Skeleton className="h-[400px] w-full rounded-lg" />;

interface Props {
  sessionId?: string;
}

const ObservatoryPanel = ({ sessionId }: Props) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Systémové MRI — read-only vizualizace všech mechanik, vazeb, DB schématu a slepých míst.
      </p>

      <Tabs defaultValue="system-graph" className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto">
          <TabsTrigger value="system-graph" className="text-xs gap-1 py-2">
            <Network className="h-3 w-3" /> System Graph
          </TabsTrigger>
          <TabsTrigger value="agency-map" className="text-xs gap-1 py-2">
            <Users className="h-3 w-3" /> Agency Map
          </TabsTrigger>
          <TabsTrigger value="hidden-metrics" className="text-xs gap-1 py-2">
            <EyeOff className="h-3 w-3" /> Hidden Metrics
          </TabsTrigger>
          <TabsTrigger value="db-schema" className="text-xs gap-1 py-2">
            <Database className="h-3 w-3" /> DB Schema
          </TabsTrigger>
          <TabsTrigger value="data-flow" className="text-xs gap-1 py-2">
            <FileSearch className="h-3 w-3" /> Data Flow
          </TabsTrigger>
          {sessionId && (
            <TabsTrigger value="live-metrics" className="text-xs gap-1 py-2">
              <Activity className="h-3 w-3" /> Live Data
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="system-graph" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <SystemGraphPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="agency-map" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <AgencyMapPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="hidden-metrics" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <HiddenMetricsPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="db-schema" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <DBSchemaPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="data-flow" className="mt-3">
          <Suspense fallback={<Fallback />}>
            <DataFlowAuditPanel />
          </Suspense>
        </TabsContent>
        {sessionId && (
          <TabsContent value="live-metrics" className="mt-3">
            <Suspense fallback={<Fallback />}>
              <LiveMetricsPanel sessionId={sessionId} />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default ObservatoryPanel;
