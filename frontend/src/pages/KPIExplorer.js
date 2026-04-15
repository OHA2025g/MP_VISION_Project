import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { statusColors } from "@/lib/translations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/utils";
import KPIDialog from "@/components/custom/KPIDialog";

const SECTORS = [
  { code: "AGR", label: "Agriculture" }, { code: "ECO", label: "Economy" },
  { code: "EDU", label: "Education" }, { code: "ENV", label: "Environment" },
  { code: "GOV", label: "Governance" }, { code: "IND", label: "Industry" },
  { code: "INF", label: "Infrastructure" }, { code: "HLT", label: "Health" },
  { code: "SOC", label: "Social" }, { code: "PMU", label: "PMU" },
];

export default function KPIExplorer() {
  const { t, lang } = useLanguage();
  const [kpis, setKpis] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [selectedKpi, setSelectedKpi] = useState(null);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.append("search", search);
      if (sector) params.append("sector", sector);
      if (status) params.append("status", status);
      const { data } = await api.get(`/kpis?${params}`);
      setKpis(data.data);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search, sector, status]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  useEffect(() => { setPage(1); }, [search, sector, status]);

  return (
    <div className="space-y-6" data-testid="kpi-explorer-page">
      <KPIDialog open={!!selectedKpi} onOpenChange={(v) => !v && setSelectedKpi(null)} kpi={selectedKpi} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-mp-navy" data-testid="kpi-explorer-title">
            {t("kpi.explorer_title")}
          </h1>
          <p className="text-sm text-gray-500 font-body mt-1">
            {total} KPIs across {SECTORS.length} sectors
          </p>
        </div>
        <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => { const p = sector ? `?sector=${sector}` : ""; window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/kpis${p}`, "_blank"); }} data-testid="export-kpi-csv-btn">
          <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      <Card className="border-mp-border shadow-sm" data-testid="kpi-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t("kpi.search")}
                value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 font-body"
                data-testid="kpi-search-input"
              />
            </div>
            <Select value={sector} onValueChange={v => setSector(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px] font-body" data-testid="kpi-sector-filter">
                <SelectValue placeholder={t("kpi.filter_sector")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("kpi.all_sectors")}</SelectItem>
                {SECTORS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={v => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px] font-body" data-testid="kpi-status-filter">
                <SelectValue placeholder={t("kpi.filter_status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("kpi.all_status")}</SelectItem>
                <SelectItem value="on_track">{t("status.on_track")}</SelectItem>
                <SelectItem value="at_risk">{t("status.at_risk")}</SelectItem>
                <SelectItem value="off_track">{t("status.off_track")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 font-body text-gray-500">{t("common.loading")}</div>
      ) : (
        <div className="space-y-3" data-testid="kpi-list">
          {kpis.map((kpi, i) => {
            const sc = statusColors[kpi.status];
            const progress = kpi.target_2029 !== kpi.baseline_2024
              ? Math.min(100, Math.max(0, ((kpi.current_value - kpi.baseline_2024) / (kpi.target_2029 - kpi.baseline_2024)) * 100))
              : 100;
            const isExpanded = expanded === kpi.kpi_id;
            return (
              <motion.div key={kpi.kpi_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card
                  className={`border-mp-border shadow-sm cursor-pointer transition-all hover:shadow-md ${isExpanded ? 'ring-1 ring-mp-primary/30' : ''}`}
                  onClick={() => setExpanded(isExpanded ? null : kpi.kpi_id)}
                  data-testid={`kpi-card-${kpi.kpi_id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 w-16 text-center">
                        <p className="text-xs font-bold text-mp-primary font-heading">{kpi.kpi_id}</p>
                        <p className="text-[10px] text-gray-400 font-body">{kpi.sector_code}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium font-body text-mp-navy truncate">
                            {lang === 'hi' ? kpi.kpi_name_hi : kpi.kpi_name}
                          </p>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${sc?.text} ${sc?.border} ${sc?.bg}`}>
                            {t(`status.${kpi.status}`)}
                          </Badge>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                        <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400 font-body">
                          <span>{t("kpi.baseline")}: {formatDecimal(kpi.baseline_2024)}{kpi.unit}</span>
                          <span>{t("kpi.current")}: <b className="text-mp-navy">{formatDecimal(kpi.current_value)}{kpi.unit}</b></span>
                          <span>{t("kpi.target_2029")}: {formatDecimal(kpi.target_2029)}{kpi.unit}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-heading font-bold text-mp-navy">{formatDecimal(kpi.current_value)}</p>
                        <p className="text-[10px] text-gray-400 font-body">{kpi.unit}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 px-2 text-[10px] font-body"
                          onClick={(e) => { e.stopPropagation(); setSelectedKpi(kpi); }}
                          data-testid={`kpi-open-${kpi.kpi_id}`}
                        >
                          View KPI
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-mp-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] text-gray-400 font-body uppercase">Theme</p>
                          <p className="text-xs font-body text-mp-navy">{kpi.theme}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-body uppercase">Formula</p>
                          <p className="text-xs font-body text-mp-navy">{kpi.formula}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-body uppercase">{t("kpi.target_2036")}</p>
                          <p className="text-xs font-body text-mp-navy">{formatDecimal(kpi.target_2036)} {kpi.unit}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-body uppercase">{t("kpi.target_2047")}</p>
                          <p className="text-xs font-body font-medium text-mp-primary">{formatDecimal(kpi.target_2047)} {kpi.unit}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3" data-testid="kpi-pagination">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="kpi-prev-btn">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-body text-gray-500">
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)} data-testid="kpi-next-btn">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
