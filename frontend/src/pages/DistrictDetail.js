import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { statusColors } from "@/lib/translations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Download, Pencil, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { formatDecimal } from "@/lib/utils";
import KPIDialog from "@/components/custom/KPIDialog";

const SECTORS = [
  { code: "AGR", label: "Agriculture" }, { code: "ECO", label: "Economy" },
  { code: "EDU", label: "Education" }, { code: "ENV", label: "Environment" },
  { code: "GOV", label: "Governance" }, { code: "IND", label: "Industry" },
  { code: "INF", label: "Infrastructure" }, { code: "HLT", label: "Health" },
  { code: "SOC", label: "Social" }, { code: "PMU", label: "PMU" },
];

export default function DistrictDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editKpi, setEditKpi] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    const params = sectorFilter ? `?sector=${sectorFilter}` : "";
    api.get(`/districts/${name}/kpis${params}`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [name, sectorFilter]);

  const handleUpdateValue = async () => {
    if (!editKpi) return;
    try {
      await api.put(`/kpis/${editKpi.kpi_id}/update-value`, { current_value: parseFloat(editValue) });
      toast.success(`Updated ${editKpi.kpi_id}`);
      setEditKpi(null);
      // Refresh
      const params = sectorFilter ? `?sector=${sectorFilter}` : "";
      const { data: newData } = await api.get(`/districts/${name}/kpis${params}`);
      setData(newData);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update");
    }
  };

  const canEdit = user?.role === "admin" || user?.role === "department_head";

  if (loading) return <div className="flex items-center justify-center h-64 font-body">{t("common.loading")}</div>;
  if (!data) return <div className="text-center py-12 font-body">{t("common.no_data")}</div>;

  const { district, kpis } = data;
  const filteredKpis = kpis.filter(k =>
    k.kpi_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.kpi_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sectorScoreData = Object.entries(district.scores || {}).map(([code, score]) => ({
    sector: code, score,
  }));

  const statusCounts = { on_track: 0, at_risk: 0, off_track: 0 };
  kpis.forEach(k => { statusCounts[k.status] = (statusCounts[k.status] || 0) + 1; });

  return (
    <div className="space-y-6" data-testid="district-detail-page">
      <KPIDialog open={!!selectedKpi} onOpenChange={(v) => !v && setSelectedKpi(null)} kpi={selectedKpi} />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/districts")} data-testid="district-back-btn">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-mp-primary" />
            <div>
              <h1 className="font-heading text-2xl font-bold text-mp-navy" data-testid="district-name">
                {lang === 'hi' ? district.name_hi : district.name}
              </h1>
              <p className="text-sm text-gray-500 font-body">
                {district.division} Division | Rank #{district.rank} | Pop: {formatDecimal(district.population / 100000)}L
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-heading font-bold text-mp-primary">{formatDecimal(district.overall_score)}</p>
          <p className="text-xs text-gray-400 font-body">Overall Score</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-mp-border shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500 font-body uppercase">KPIs Shown</p>
          <p className="text-2xl font-heading font-bold text-mp-primary mt-1">{kpis.length}</p>
        </CardContent></Card>
        <Card className="border-mp-border shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500 font-body uppercase">On Track</p>
          <p className="text-2xl font-heading font-bold text-emerald-600 mt-1">{statusCounts.on_track}</p>
        </CardContent></Card>
        <Card className="border-mp-border shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500 font-body uppercase">At Risk</p>
          <p className="text-2xl font-heading font-bold text-amber-600 mt-1">{statusCounts.at_risk}</p>
        </CardContent></Card>
        <Card className="border-mp-border shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500 font-body uppercase">Off Track</p>
          <p className="text-2xl font-heading font-bold text-red-600 mt-1">{statusCounts.off_track}</p>
        </CardContent></Card>
      </div>

      <Card className="border-mp-border shadow-sm" data-testid="district-sector-chart">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base text-mp-navy">Sector Performance Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sectorScoreData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
              <XAxis dataKey="sector" tick={{ fontSize: 10, fill: '#475569' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#475569' }} />
              <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans' }} />
              <Bar dataKey="score" fill="#0CA4E8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-mp-border shadow-sm" data-testid="district-kpi-table">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="font-heading text-base text-mp-navy flex-1">KPI Breakdown</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs w-[180px] font-body" data-testid="district-kpi-search" />
            </div>
            <Select value={sectorFilter} onValueChange={v => setSectorFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs font-body"><SelectValue placeholder="All Sectors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sectors</SelectItem>
                {SECTORS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-mp-border sticky top-0">
                <tr>
                  {["KPI ID", "Name", "Sector", "State Value", "District Est.", "Unit", "Status", ...(canEdit ? ["Edit"] : [])].map(h => (
                    <th key={h} className="text-left p-2.5 font-body font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredKpis.map(kpi => {
                  const sc = statusColors[kpi.status];
                  return (
                    <tr key={kpi.kpi_id} className="border-b border-mp-border/50 hover:bg-gray-50" data-testid={`district-kpi-${kpi.kpi_id}`}>
                      <td className="p-2.5 font-body font-medium text-mp-primary">{kpi.kpi_id}</td>
                      <td className="p-2.5 font-body text-mp-navy max-w-[200px] truncate">
                        <button className="text-left hover:underline" onClick={() => setSelectedKpi(kpi)} data-testid={`kpi-open-${kpi.kpi_id}`}>
                          {kpi.kpi_name}
                        </button>
                      </td>
                      <td className="p-2.5 font-body text-gray-500">{kpi.sector_code}</td>
                      <td className="p-2.5 font-body">{formatDecimal(kpi.current_value)}</td>
                      <td className="p-2.5 font-body font-medium text-mp-navy">{formatDecimal(kpi.district_value)}</td>
                      <td className="p-2.5 font-body text-gray-400">{kpi.unit}</td>
                      <td className="p-2.5"><Badge variant="outline" className={`text-[9px] ${sc?.text} ${sc?.border} ${sc?.bg}`}>{kpi.status.replace("_", " ")}</Badge></td>
                      {canEdit && (
                        <td className="p-2.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditKpi(kpi); setEditValue(kpi.current_value.toString()); }} data-testid={`edit-district-kpi-${kpi.kpi_id}`}>
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

      <Dialog open={!!editKpi} onOpenChange={() => setEditKpi(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Update {editKpi?.kpi_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-body text-gray-500">{editKpi?.kpi_name}</p>
            <div>
              <Label className="font-body text-xs">Current Value ({editKpi?.unit})</Label>
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
