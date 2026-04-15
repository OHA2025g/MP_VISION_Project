import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { statusColors } from "@/lib/translations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import { Sparkles, ArrowLeft, Download, Search, CheckCircle2, AlertTriangle, XCircle, Pencil, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/utils";
import KPIDialog from "@/components/custom/KPIDialog";

const PIE_COLORS = ["#10B981", "#F59E0B", "#EF4444"];

export default function SectorDetail() {
  const { code } = useParams();
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sector, setSector] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editKpi, setEditKpi] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [selectedKpi, setSelectedKpi] = useState(null);

  const canEdit = user?.role === "admin" || (user?.role === "department_head" && user?.assigned_sector === code?.toUpperCase());

  useEffect(() => {
    setLoading(true);
    setAiInsight("");
    api.get(`/sectors/${code}`).then(r => setSector(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [code]);

  const generateInsight = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post("/insights/generate", {
        context_type: "sector", context_id: code,
        query: `Analyze the performance of ${sector?.name} sector. Highlight key achievements, risks, and strategic recommendations.`
      });
      setAiInsight(data.insight);
    } catch { setAiInsight("Failed to generate insight."); }
    finally { setAiLoading(false); }
  };

  const handleUpdateValue = async () => {
    if (!editKpi) return;
    try {
      await api.put(`/kpis/${editKpi.kpi_id}/update-value`, { current_value: parseFloat(editValue) });
      toast.success(`Updated ${editKpi.kpi_id}`);
      setEditKpi(null);
      const { data } = await api.get(`/sectors/${code}`);
      setSector(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to update"); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 font-body">{t("common.loading")}</div>;
  if (!sector) return <div className="text-center py-12 font-body">{t("common.no_data")}</div>;

  const kpis = sector.kpis || [];
  const themes = [...new Set(kpis.map(k => k.theme))];
  const onTrack = kpis.filter(k => k.status === "on_track").length;
  const atRisk = kpis.filter(k => k.status === "at_risk").length;
  const offTrack = kpis.filter(k => k.status === "off_track").length;
  const scorePercent = kpis.length > 0 ? (onTrack / kpis.length) * 100 : 0;

  const filteredKpis = kpis.filter(k =>
    k.kpi_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.kpi_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pieData = [
    { name: t("status.on_track"), value: onTrack },
    { name: t("status.at_risk"), value: atRisk },
    { name: t("status.off_track"), value: offTrack },
  ];

  return (
    <div className="space-y-6" data-testid="sector-detail-page">
      <KPIDialog open={!!selectedKpi} onOpenChange={(v) => !v && setSelectedKpi(null)} kpi={selectedKpi} />
      {/* Sector Header */}
      <div className="relative rounded-xl overflow-hidden" style={{ backgroundColor: sector.color + '10' }}>
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: sector.color }} />
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="shrink-0" data-testid="back-btn">
            <ArrowLeft className="w-5 h-5 text-mp-navy" />
          </Button>
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-white font-bold font-heading text-base sm:text-lg shadow-md shrink-0" style={{ backgroundColor: sector.color }}>
            {sector.code}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg sm:text-xl lg:text-2xl font-bold text-mp-navy" data-testid="sector-name">
              {lang === 'hi' ? sector.name_hi : sector.name}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-body mt-0.5 line-clamp-2">{lang === 'hi' ? sector.description_hi : sector.description}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-center hidden sm:block">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center" style={{ borderColor: sector.color }}>
                <span className="text-base sm:text-lg font-heading font-bold" style={{ color: sector.color }}>{formatDecimal(scorePercent)}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-body mt-1">Score</p>
            </div>
            <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/sector/${code}/pdf`, "_blank")} data-testid="export-sector-pdf-btn">
              <FileText className="w-3.5 h-3.5 mr-1" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/sector/${code}`, "_blank")} data-testid="export-sector-csv-btn">
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </div>

      {/* 4 Status Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total KPIs", value: kpis.length, icon: null, bg: "bg-mp-primary/5", border: "border-mp-primary/20", textColor: "text-mp-primary" },
          { label: t("status.on_track"), value: onTrack, icon: CheckCircle2, bg: "bg-emerald-50", border: "border-emerald-200", textColor: "text-emerald-600" },
          { label: t("status.at_risk"), value: atRisk, icon: AlertTriangle, bg: "bg-amber-50", border: "border-amber-200", textColor: "text-amber-600" },
          { label: t("status.off_track"), value: offTrack, icon: XCircle, bg: "bg-red-50", border: "border-red-200", textColor: "text-red-600" },
        ].map(({ label, value, icon: Icon, bg, border, textColor }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className={`${border} border shadow-sm`} data-testid={`sector-stat-${i}`}>
              <CardContent className={`p-4 ${bg} rounded-lg`}>
                <div className="flex items-center gap-2 mb-1">
                  {Icon && <Icon className={`w-4 h-4 ${textColor}`} />}
                  <p className="text-[10px] text-gray-500 font-body uppercase tracking-wider">{label}</p>
                </div>
                <p className={`text-2xl font-heading font-bold ${textColor}`}>{value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Sector Progress Bar */}
      <Card className="border-mp-border shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-semibold text-sm text-mp-navy">Sector Progress</h3>
            <span className="text-lg font-heading font-bold" style={{ color: sector.color }}>{formatDecimal(scorePercent)}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, scorePercent))}%`, backgroundColor: sector.color }} />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="border-mp-border" data-testid="sector-tabs">
          <TabsTrigger value="overview" className="font-body text-xs">Overview</TabsTrigger>
          <TabsTrigger value="kpis" className="font-body text-xs">{t("sector.kpi_list")} ({kpis.length})</TabsTrigger>
          <TabsTrigger value="trends" className="font-body text-xs">{t("sector.trend")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Theme Progress */}
            <Card className="border-mp-border shadow-sm" data-testid="sector-themes-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-sm text-mp-navy">{t("sector.themes")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {themes.map(theme => {
                  const themeKpis = kpis.filter(k => k.theme === theme);
                  const themeOnTrack = themeKpis.filter(k => k.status === "on_track").length;
                  const pct = themeKpis.length > 0 ? (themeOnTrack / themeKpis.length) * 100 : 0;
                  return (
                    <div key={theme} className="p-3 rounded-lg bg-gray-50 border border-mp-border/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-body font-medium text-mp-navy truncate flex-1">{theme}</p>
                        <span className="text-xs font-heading font-bold ml-2" style={{ color: sector.color }}>{formatDecimal(pct)}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: sector.color }} />
                      </div>
                      <p className="text-[10px] text-gray-400 font-body mt-1">{themeOnTrack}/{themeKpis.length} on track</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* KPI Distribution Pie + Top KPIs Bar */}
            <div className="space-y-4">
              <Card className="border-mp-border shadow-sm" data-testid="sector-pie-chart">
                <CardHeader className="pb-1">
                  <CardTitle className="font-heading text-sm text-mp-navy">KPI Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="border-mp-border shadow-sm" data-testid="sector-bar-chart">
                <CardHeader className="pb-1">
                  <CardTitle className="font-heading text-sm text-mp-navy">Current vs Target 2029</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={kpis.slice(0, 8).map(k => ({ name: k.kpi_id, Current: k.current_value, Target: k.target_2029 }))} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                      <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans', fontSize: 11 }} />
                      <Bar dataKey="Current" fill={sector.color} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Target" fill="#E2DFD2" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kpis">
          <Card className="border-mp-border shadow-sm" data-testid="sector-kpi-table">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input placeholder="Search KPIs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs font-body" data-testid="sector-kpi-search" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-mp-border sticky top-0">
                    <tr>
                      {["KPI ID", lang === 'hi' ? 'नाम' : 'Name', "Theme", t("kpi.baseline"), t("kpi.current"), t("kpi.target_2029"), "Status", ...(canEdit ? ["Edit"] : [])].map(h => (
                        <th key={h} className="text-left p-2.5 font-body font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKpis.map(kpi => {
                      const sc = statusColors[kpi.status];
                      return (
                        <tr key={kpi.kpi_id} className="border-b border-mp-border/50 hover:bg-gray-50" data-testid={`kpi-row-${kpi.kpi_id}`}>
                          <td className="p-2.5 font-body font-medium text-mp-primary">{kpi.kpi_id}</td>
                          <td className="p-2.5 font-body text-mp-navy max-w-[180px] truncate">
                            <button className="text-left hover:underline" onClick={() => setSelectedKpi(kpi)} data-testid={`kpi-open-${kpi.kpi_id}`}>
                              {lang === 'hi' ? kpi.kpi_name_hi : kpi.kpi_name}
                            </button>
                          </td>
                          <td className="p-2.5 font-body text-gray-400 max-w-[120px] truncate">{kpi.theme}</td>
                          <td className="p-2.5 font-body text-gray-500">{formatDecimal(kpi.baseline_2024)} {kpi.unit}</td>
                          <td className="p-2.5 font-body font-medium text-mp-navy">{formatDecimal(kpi.current_value)} {kpi.unit}</td>
                          <td className="p-2.5 font-body text-gray-500">{formatDecimal(kpi.target_2029)} {kpi.unit}</td>
                          <td className="p-2.5"><Badge variant="outline" className={`text-[9px] ${sc?.text} ${sc?.border} ${sc?.bg}`}>{t(`status.${kpi.status}`)}</Badge></td>
                          {canEdit && (
                            <td className="p-2.5">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditKpi(kpi); setEditValue(kpi.current_value.toString()); }} data-testid={`edit-kpi-${kpi.kpi_id}`}>
                                <Pencil className="w-3 h-3 text-mp-primary" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {kpis.slice(0, 6).map(kpi => (
              <Card key={kpi.kpi_id} className="border-mp-border shadow-sm" data-testid={`trend-chart-${kpi.kpi_id}`}>
                <CardHeader className="pb-1">
                  <CardTitle className="font-heading text-xs text-mp-navy">{kpi.kpi_id}: {lang === 'hi' ? kpi.kpi_name_hi : kpi.kpi_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={kpi.trend_data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                      <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans', fontSize: 11 }} />
                      <Line type="monotone" dataKey="value" stroke={sector.color} strokeWidth={2} dot={{ r: 2.5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* AI Insights */}
      <Card className="border-mp-gold/30 shadow-sm bg-gradient-to-r from-mp-cream to-white" data-testid="sector-ai-panel">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-mp-gold" />
              <CardTitle className="font-heading text-base text-mp-navy">{t("ai.title")} - {sector.code}</CardTitle>
            </div>
            <Button onClick={generateInsight} disabled={aiLoading} size="sm" className="bg-mp-gold hover:bg-mp-darkgold text-white font-body" data-testid="sector-ai-btn">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {aiLoading ? t("ai.generating") : t("ai.generate")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiInsight ? (
            <div className="bg-white/60 rounded-lg p-4 border border-mp-gold/20 font-body text-sm text-mp-navy whitespace-pre-wrap" data-testid="sector-ai-text">{aiInsight}</div>
          ) : (
            <p className="text-sm text-gray-400 font-body italic">{t("ai.ask")}</p>
          )}
        </CardContent>
      </Card>

      {/* Edit KPI Dialog */}
      <Dialog open={!!editKpi} onOpenChange={() => setEditKpi(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Update {editKpi?.kpi_id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-body text-gray-500">{editKpi?.kpi_name}</p>
            <div><Label className="font-body text-xs">Current Value ({editKpi?.unit})</Label>
              <Input type="number" className="font-body mt-1" value={editValue} onChange={e => setEditValue(e.target.value)} data-testid="edit-kpi-value-input" />
            </div>
            <div className="flex gap-4 text-xs font-body text-gray-400">
              <span>Baseline: {formatDecimal(editKpi?.baseline_2024)}</span>
              <span>Target 2029: {formatDecimal(editKpi?.target_2029)}</span>
            </div>
            <Button onClick={handleUpdateValue} className="w-full bg-mp-primary text-white font-body" data-testid="save-kpi-value-btn">Update Value</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
