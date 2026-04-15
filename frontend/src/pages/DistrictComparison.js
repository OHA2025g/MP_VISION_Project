import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip as RTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { MapPin, Search, X, Download, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/utils";

const COMPARE_COLORS = ["#0CA4E8", "#D4AF37", "#E65100", "#6A1B9A"];

export default function DistrictComparison() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const SECTOR_LABELS = {
    AGR: "Agriculture", ECO: "Economy", EDU: "Education", ENV: "Environment",
    GOV: "Governance", IND: "Industry", INF: "Infrastructure", HLT: "Health",
    SOC: "Social", PMU: "PMU"
  };

  useEffect(() => {
    api.get("/districts").then(r => setDistricts(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggleSelect = (d) => {
    if (selected.find(s => s.name === d.name)) {
      setSelected(selected.filter(s => s.name !== d.name));
    } else if (selected.length < 4) {
      setSelected([...selected, d]);
    }
  };

  const filtered = districts.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.name_hi.includes(searchTerm)
  );

  const radarData = Object.keys(SECTOR_LABELS).map(code => {
    const point = { sector: SECTOR_LABELS[code] };
    selected.forEach(d => { point[d.name] = d.scores?.[code] || 0; });
    return point;
  });

  const barData = selected.map(d => ({
    name: lang === 'hi' ? d.name_hi : d.name,
    score: d.overall_score,
  }));

  if (loading) return <div className="flex items-center justify-center h-64 font-body">{t("common.loading")}</div>;

  return (
    <div className="space-y-6" data-testid="district-comparison-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-mp-navy" data-testid="districts-title">
          {t("districts.title")}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-gray-500 font-body">
            {districts.length} districts | Select up to 4 to compare
          </p>
          <Button size="sm" variant="outline" className="font-body text-xs" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/districts`, "_blank")} data-testid="export-districts-csv-btn">
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-mp-border shadow-sm lg:col-span-1" data-testid="district-selector">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base text-mp-navy">{t("districts.select")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search districts..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 font-body" data-testid="district-search-input"
              />
            </div>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((d, i) => (
                  <Badge key={d.name} className="text-xs font-body text-white" style={{ backgroundColor: COMPARE_COLORS[i] }}>
                    {lang === 'hi' ? d.name_hi : d.name}
                    <button onClick={(e) => { e.stopPropagation(); toggleSelect(d); }} className="ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="max-h-[400px] overflow-auto space-y-1 scrollbar-thin" data-testid="district-list">
              {filtered.map(d => {
                const isSelected = selected.find(s => s.name === d.name);
                return (
                  <button
                    key={d.name}
                    onClick={() => toggleSelect(d)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all text-sm font-body ${
                      isSelected ? 'bg-mp-primary/10 border border-mp-primary/30' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                    data-testid={`district-item-${d.name.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-mp-primary' : 'text-gray-300'}`} />
                      <div>
                        <p className="text-mp-navy font-medium">{lang === 'hi' ? d.name_hi : d.name}</p>
                        <p className="text-[10px] text-gray-400">{d.division} | Rank #{d.rank}</p>
                      </div>
                    </div>
                    <span className="text-xs font-heading font-bold text-mp-primary">{formatDecimal(d.overall_score)}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {selected.length >= 2 ? (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="border-mp-border shadow-sm" data-testid="radar-chart">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-heading text-base text-mp-navy">Sector-wise Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#E2DFD2" />
                        <PolarAngleAxis dataKey="sector" tick={{ fontSize: 10, fill: '#475569' }} />
                        <PolarRadiusAxis tick={{ fontSize: 9, fill: '#94A3B8' }} domain={[0, 100]} />
                        {selected.map((d, i) => (
                          <Radar key={d.name} name={d.name} dataKey={d.name} stroke={COMPARE_COLORS[i]} fill={COMPARE_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                        ))}
                        <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans' }} />
                        <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'IBM Plex Sans' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <Card className="border-mp-border shadow-sm" data-testid="comparison-bar-chart">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base text-mp-navy">Overall Score Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData} layout="vertical" barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DFD2" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={100} />
                      <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DFD2', fontFamily: 'IBM Plex Sans' }} />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                        {barData.map((_, i) => (
                          <motion.rect key={i} fill={COMPARE_COLORS[i % COMPARE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-mp-border shadow-sm" data-testid="comparison-table">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base text-mp-navy">Detailed Comparison</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-mp-border">
                        <tr>
                          <th className="text-left p-3 font-body font-medium text-gray-500">Sector</th>
                          {selected.map((d, i) => (
                            <th key={d.name} className="text-center p-3 font-body font-medium" style={{ color: COMPARE_COLORS[i] }}>
                              {lang === 'hi' ? d.name_hi : d.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(SECTOR_LABELS).map(([code, label]) => (
                          <tr key={code} className="border-b border-mp-border/50">
                            <td className="p-3 font-body text-mp-navy">{label}</td>
                            {selected.map(d => (
                              <td key={d.name} className="p-3 text-center font-heading font-bold text-mp-navy">
                                {Number.isFinite(Number(d.scores?.[code])) ? formatDecimal(d.scores[code]) : "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-medium">
                          <td className="p-3 font-body text-mp-navy">Overall</td>
                          {selected.map((d, i) => (
                            <td key={d.name} className="p-3 text-center font-heading font-bold" style={{ color: COMPARE_COLORS[i] }}>
                              {formatDecimal(d.overall_score)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-mp-border shadow-sm" data-testid="select-prompt">
              <CardContent className="p-12 text-center">
                <MapPin className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="font-body text-gray-400">
                  {selected.length === 0
                    ? "Select at least 2 districts from the list to start comparing"
                    : "Select one more district to see the comparison"
                  }
                </p>
              </CardContent>
            </Card>
          )}

          {selected.length === 0 && (
            <Card className="border-mp-border shadow-sm" data-testid="all-districts-table">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base text-mp-navy">All Districts Ranking</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-mp-border sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-body font-medium text-gray-500">{t("districts.rank")}</th>
                        <th className="text-left p-3 font-body font-medium text-gray-500">{t("districts.name")}</th>
                        <th className="text-left p-3 font-body font-medium text-gray-500">{t("districts.division")}</th>
                        <th className="text-right p-3 font-body font-medium text-gray-500">{t("districts.score")}</th>
                        <th className="text-center p-3 font-body font-medium text-gray-500">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {districts.map(d => (
                        <tr key={d.name} className="border-b border-mp-border/50 hover:bg-gray-50 cursor-pointer" onClick={() => toggleSelect(d)} data-testid={`district-row-${d.rank}`}>
                          <td className="p-3 font-heading font-bold text-mp-primary text-center w-12">{d.rank}</td>
                          <td className="p-3 font-body text-mp-navy">{lang === 'hi' ? d.name_hi : d.name}</td>
                          <td className="p-3 font-body text-gray-500">{d.division}</td>
                          <td className="p-3 font-heading font-bold text-mp-navy text-right">{formatDecimal(d.overall_score)}</td>
                          <td className="p-3 text-center">
                            <Button size="sm" variant="ghost" className="h-7 text-xs font-body text-mp-primary" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/districts/${d.name}`); }} data-testid={`view-district-${d.name}`}>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
