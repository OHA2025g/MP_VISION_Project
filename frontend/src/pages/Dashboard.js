import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Target, TrendingUp, AlertTriangle, XCircle, MapPin, Sparkles, Clock,
  ArrowUpRight, CheckCircle2, Download, Layers, FileText
} from "lucide-react";
import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/utils";

const PIE_COLORS = ["#10B981", "#F59E0B", "#EF4444"];

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [sectorPerf, setSectorPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/overview"),
      api.get("/dashboard/sector-performance")
    ]).then(([ov, sp]) => {
      setOverview(ov.data);
      setSectorPerf(sp.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const generateInsight = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post("/insights/generate", { context_type: "general", query: "Give an overall strategic summary of MP Vision 2047 progress with key achievements and risks." });
      setAiInsight(data.insight);
    } catch {
      setAiInsight("Failed to generate insight. Please try again.");
    } finally { setAiLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 font-body text-gray-500">{t("common.loading")}</div>;
  if (!overview) return <div className="text-center py-12 font-body">{t("common.no_data")}</div>;

  const { kpi_status, key_indicators, top_districts, bottom_districts, sectors, districts_count } = overview;
  const totalKpis = overview.total_kpis;
  const overallProgress = (kpi_status.on_track / Math.max(totalKpis, 1)) * 100;

  const pieData = [
    { name: t("status.on_track"), value: kpi_status.on_track },
    { name: t("status.at_risk"), value: kpi_status.at_risk },
    { name: t("status.off_track"), value: kpi_status.off_track },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Header with role badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-mp-navy" data-testid="dashboard-title">
            CM Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-body mt-0.5">
            {lang === 'hi' ? 'समृद्ध मध्य प्रदेश 2047 - प्रगति ट्रैकिंग' : 'Samriddh Madhya Pradesh 2047 - Progress Tracking'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400 font-body uppercase tracking-wider">Last Updated</p>
            <p className="text-sm font-heading font-medium text-mp-navy">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/dashboard/pdf`, "_blank")} data-testid="cm-pdf-btn">
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/kpis`, "_blank")} data-testid="cm-export-btn">
            <Download className="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* 5 Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total KPIs", value: totalKpis, icon: Target, color: "text-mp-primary", bg: "bg-mp-primary/5", border: "border-mp-primary/20" },
          { label: "Sectors", value: sectors?.length || 10, icon: Layers, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
          { label: "Districts", value: districts_count ?? 55, icon: MapPin, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200" },
          { label: t("dashboard.on_track"), value: kpi_status.on_track, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Active Alerts", value: kpi_status.off_track, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
        ].map(({ label, value, icon: Icon, color, bg, border }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className={`${border} border shadow-sm hover:shadow-md transition-shadow`} data-testid={`metric-card-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <p className="text-2xl font-heading font-bold text-mp-navy">{value}</p>
                <p className="text-[10px] font-body text-gray-400 uppercase tracking-wider mt-0.5">{label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Overall Progress */}
      <Card className="border-mp-border shadow-sm" data-testid="overall-progress">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-mp-navy text-base">Overall Progress</h3>
            <span className="text-2xl font-heading font-bold text-mp-primary">{formatDecimal(overallProgress)}%</span>
          </div>
          <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-mp-primary via-mp-gold to-mp-orange transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { label: t("status.on_track"), value: kpi_status.on_track, icon: CheckCircle2, bg: "bg-emerald-500", lightBg: "bg-emerald-50" },
              { label: t("status.at_risk"), value: kpi_status.at_risk, icon: AlertTriangle, bg: "bg-amber-500", lightBg: "bg-amber-50" },
              { label: t("status.off_track"), value: kpi_status.off_track, icon: XCircle, bg: "bg-red-500", lightBg: "bg-red-50" },
            ].map(({ label, value, icon: Icon, bg, lightBg }) => (
              <div key={label} className={`${lightBg} rounded-xl p-4 text-center`} data-testid={`status-card-${label.toLowerCase().replace(/\s/g, '-')}`}>
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-6 h-6 ${bg} rounded-full flex items-center justify-center`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-xl font-heading font-bold text-mp-navy">{value}</span>
                </div>
                <p className="text-xs font-body text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sectoral Pillars */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-semibold text-mp-navy">
            {lang === 'hi' ? '10 क्षेत्रीय स्तंभ' : '10 Sectoral Pillars'}
          </h2>
          <span className="text-xs text-gray-400 font-body">{lang === 'hi' ? 'क्षेत्रीय डैशबोर्ड देखें' : 'Click to view Sectoral Dashboard'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4" data-testid="sector-grid">
          {sectorPerf.map((s, i) => {
            const total = s.on_track + s.at_risk + s.off_track;
            const scorePercent = total > 0 ? (s.on_track / total) * 100 : 0;
            return (
              <motion.div key={s.code} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
                <Card
                  className="border-mp-border shadow-sm hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
                  onClick={() => navigate(`/dashboard/sectors/${s.code}`)}
                  data-testid={`sector-card-${s.code}`}
                >
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: s.color }} />
                  <CardContent className="p-4 pt-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold font-heading" style={{ backgroundColor: s.color }}>
                        {s.code}
                      </div>
                      <div className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center" style={{ borderColor: s.color }}>
                        <span className="text-[10px] font-heading font-bold" style={{ color: s.color }}>{formatDecimal(scorePercent)}</span>
                      </div>
                    </div>
                    <h3 className="font-heading text-xs font-medium text-mp-navy leading-tight mb-2 min-h-[2rem] group-hover:text-mp-primary transition-colors">
                      {lang === 'hi' ? s.name_hi : s.name}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-body mb-2">{s.kpi_count} KPIs</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, scorePercent))}%`, backgroundColor: s.color }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[9px] font-body">
                      <span className="text-emerald-600">{s.on_track} on track</span>
                      <span className="text-amber-600">{s.at_risk} at risk</span>
                      <span className="text-red-600">{s.off_track} off</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Charts + KPI Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-mp-border shadow-sm" data-testid="sector-performance-chart">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base text-mp-navy">{t("dashboard.sector_performance")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sectorPerf.map(s => ({ name: s.code, [t("status.on_track")]: s.on_track, [t("status.at_risk")]: s.at_risk, [t("status.off_track")]: s.off_track }))} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} />
                <Bar dataKey={t("status.on_track")} fill="#10B981" radius={[3, 3, 0, 0]} />
                <Bar dataKey={t("status.at_risk")} fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Bar dataKey={t("status.off_track")} fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-mp-border shadow-sm" data-testid="kpi-distribution-chart">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base text-mp-navy">{t("dashboard.kpi_distribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Key Indicators + Districts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-mp-border shadow-sm" data-testid="key-indicators-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base text-mp-navy">{t("dashboard.key_indicators")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {key_indicators?.map(kpi => {
              const progress = kpi.target_2029 !== kpi.baseline_2024
                ? Math.min(100, Math.max(0, ((kpi.current_value - kpi.baseline_2024) / (kpi.target_2029 - kpi.baseline_2024)) * 100))
                : 100;
              return (
                <div key={kpi.kpi_id} className="flex items-center gap-3" data-testid={`key-indicator-${kpi.kpi_id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium font-body text-mp-navy truncate">{lang === 'hi' ? kpi.kpi_name_hi : kpi.kpi_name}</span>
                      <span className="text-xs font-heading font-bold text-mp-navy ml-2">{formatDecimal(kpi.current_value)}<span className="text-[10px] text-gray-400 ml-0.5">{kpi.unit}</span></span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-mp-border shadow-sm" data-testid="top-districts-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base text-mp-navy">{t("dashboard.top_districts")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {top_districts?.slice(0, 5).map((d, i) => (
                <div key={d.name} className="flex items-center justify-between p-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/dashboard/districts/${d.name}`)} data-testid={`top-district-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold font-heading">{d.rank}</span>
                    <span className="text-xs font-body text-mp-navy">{lang === 'hi' ? d.name_hi : d.name}</span>
                  </div>
                  <span className="text-xs font-heading font-bold text-emerald-600">{formatDecimal(d.overall_score)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-red-100 shadow-sm" data-testid="bottom-districts-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base text-red-700">{t("dashboard.bottom_districts")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {bottom_districts?.slice(0, 5).map((d, i) => (
                <div key={d.name} className="flex items-center justify-between p-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/dashboard/districts/${d.name}`)} data-testid={`bottom-district-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold font-heading">{d.rank}</span>
                    <span className="text-xs font-body text-mp-navy">{lang === 'hi' ? d.name_hi : d.name}</span>
                  </div>
                  <span className="text-xs font-heading font-bold text-red-600">{formatDecimal(d.overall_score)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Insights */}
      <Card className="border-mp-gold/30 shadow-sm bg-gradient-to-r from-mp-cream to-white" data-testid="ai-insights-panel">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-mp-gold" />
              <CardTitle className="font-heading text-base text-mp-navy">{t("ai.title")}</CardTitle>
            </div>
            <Button onClick={generateInsight} disabled={aiLoading} size="sm" className="bg-mp-gold hover:bg-mp-darkgold text-white font-body" data-testid="generate-insight-btn">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {aiLoading ? t("ai.generating") : t("ai.generate")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiInsight ? (
            <div className="bg-white/60 rounded-lg p-4 border border-mp-gold/20 font-body text-sm text-mp-navy whitespace-pre-wrap" data-testid="ai-insight-text">{aiInsight}</div>
          ) : (
            <p className="text-sm text-gray-400 font-body italic">{t("ai.ask")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
