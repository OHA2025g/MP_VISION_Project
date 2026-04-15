import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { formatDecimal } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  BarChart,
  Bar,
} from "recharts";

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function computeProgressPct(kpi) {
  const b = Number(kpi?.baseline_2024);
  const c = Number(kpi?.current_value);
  const t = Number(kpi?.target_2029);
  if (![b, c, t].every(Number.isFinite) || t === b) return 100;
  return ((c - b) / (t - b)) * 100;
}

export default function KPIDialog({ open, onOpenChange, kpi }) {
  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    if (!open) {
      setInsight("");
      setLoadingInsight(false);
    }
  }, [open]);

  const progressPct = useMemo(() => computeProgressPct(kpi), [kpi]);
  const chartData = useMemo(() => (Array.isArray(kpi?.trend_data) ? kpi.trend_data : []), [kpi]);
  const bars = useMemo(() => ([
    { name: "Baseline 2024", value: Number(kpi?.baseline_2024) || 0 },
    { name: "Current", value: Number(kpi?.current_value) || 0 },
    { name: "Target 2029", value: Number(kpi?.target_2029) || 0 },
    { name: "Target 2036", value: Number(kpi?.target_2036) || 0 },
    { name: "Target 2047", value: Number(kpi?.target_2047) || 0 },
  ]), [kpi]);

  const loadInsight = async () => {
    if (!kpi?.kpi_id) return;
    setLoadingInsight(true);
    try {
      const { data } = await api.post("/insights/generate", {
        context_type: "kpi",
        context_id: kpi.kpi_id,
        query: "Give a concise KPI insight: current status, gap to targets, risks, and next actions.",
      });
      setInsight(data?.insight || "");
    } catch (e) {
      setInsight(e?.response?.data?.detail || "Failed to generate insight.");
    } finally {
      setLoadingInsight(false);
    }
  };

  if (!kpi) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-mp-navy">
            {kpi.kpi_id} — {kpi.kpi_name}
          </DialogTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] font-body">{kpi.sector_code}</Badge>
            <Badge variant="outline" className="text-[10px] font-body">{kpi.theme}</Badge>
            <Badge variant="outline" className="text-[10px] font-body">{kpi.status?.replaceAll("_", " ")}</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="snapshot" className="mt-2">
          <TabsList className="border-mp-border">
            <TabsTrigger value="snapshot" className="font-body text-xs">KPI Snapshot</TabsTrigger>
            <TabsTrigger value="graphs" className="font-body text-xs">Graphs</TabsTrigger>
            <TabsTrigger value="insights" className="font-body text-xs">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="snapshot" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-mp-border shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm text-mp-navy">Progress to 2029</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 font-body uppercase">{kpi.unit || "Unit"}</p>
                      <p className="text-2xl font-heading font-bold text-mp-navy">{formatDecimal(kpi.current_value)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-body uppercase">Target 2029</p>
                      <p className="text-lg font-heading font-bold text-mp-primary">{formatDecimal(kpi.target_2029)}</p>
                    </div>
                  </div>
                  <Progress value={clampPct(progressPct)} className="h-2" />
                  <div className="flex justify-between text-[10px] font-body text-gray-400">
                    <span>Baseline: {formatDecimal(kpi.baseline_2024)}</span>
                    <span>{formatDecimal(progressPct)}%</span>
                  </div>
                  <div className="text-xs font-body text-gray-500">
                    <span className="font-medium text-mp-navy">Formula:</span> {kpi.formula || "—"}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-mp-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm text-mp-navy">Targets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs font-body">
                  {[
                    ["2029", kpi.target_2029],
                    ["2036", kpi.target_2036],
                    ["2047", kpi.target_2047],
                  ].map(([y, v]) => (
                    <div key={y} className="flex justify-between">
                      <span className="text-gray-500">Target {y}</span>
                      <span className="font-heading font-bold text-mp-navy">{formatDecimal(v)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="graphs" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-mp-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm text-mp-navy">Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#475569" }} />
                      <RTooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2DFD2", fontFamily: "IBM Plex Sans", fontSize: 12 }} />
                      <Line type="monotone" dataKey="value" stroke="#0CA4E8" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-mp-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm text-mp-navy">Current vs Targets</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={bars} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#475569" }} />
                      <RTooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2DFD2", fontFamily: "IBM Plex Sans", fontSize: 12 }} />
                      <Bar dataKey="value" fill="#10B981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-4">
            <Card className="border-mp-gold/30 shadow-sm bg-gradient-to-r from-mp-cream to-white">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-heading text-sm text-mp-navy flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-mp-gold" /> KPI Insight
                  </CardTitle>
                  <Button
                    size="sm"
                    className="bg-mp-gold hover:bg-mp-darkgold text-white font-body text-xs"
                    onClick={loadInsight}
                    disabled={loadingInsight}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {loadingInsight ? "Generating..." : "Generate"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {insight ? (
                  <div className="bg-white/60 rounded-lg p-4 border border-mp-gold/20 font-body text-sm text-mp-navy whitespace-pre-wrap">
                    {insight}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 font-body italic">
                    Click “Generate” to get KPI insights.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

