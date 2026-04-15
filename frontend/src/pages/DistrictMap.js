import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, MapPin, Info, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import * as topojson from "topojson-client";
import { formatDecimal } from "@/lib/utils";

// Map GeoJSON district names to our DB names
const NAME_MAP = {
  Hoshangabad: "Narmadapuram",
  Narsimhapur: "Narsinghpur",
};

const SECTORS = [
  { code: "", label: "Overall Score" },
  { code: "AGR", label: "Agriculture" }, { code: "ECO", label: "Economy" },
  { code: "EDU", label: "Education" }, { code: "ENV", label: "Environment" },
  { code: "GOV", label: "Governance" }, { code: "IND", label: "Industry" },
  { code: "INF", label: "Infrastructure" }, { code: "HLT", label: "Health" },
  { code: "SOC", label: "Social" }, { code: "PMU", label: "PMU" },
];

function getColor(score) {
  if (score >= 80) return "#059669";
  if (score >= 70) return "#10B981";
  if (score >= 60) return "#34D399";
  if (score >= 50) return "#FBBF24";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function getColorClass(score) {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 60) return "Above Average";
  if (score >= 50) return "Average";
  if (score >= 40) return "Below Average";
  return "Critical";
}

// Simple Mercator projection for MP
function project(lon, lat, vw, vh, bounds) {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const pad = 20;
  const x = pad + ((lon - minLon) / (maxLon - minLon)) * (vw - 2 * pad);
  const y = pad + ((maxLat - lat) / (maxLat - minLat)) * (vh - 2 * pad);
  return [x, y];
}

function geoPathToSvg(geometry, vw, vh, bounds) {
  const paths = [];
  const coords = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of coords) {
    for (const ring of polygon) {
      let d = "";
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1], vw, vh, bounds);
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
      }
      d += "Z";
      paths.push(d);
    }
  }
  return paths.join(" ");
}

function getCentroid(geometry, vw, vh, bounds) {
  let sumX = 0, sumY = 0, count = 0;
  const coords = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of coords) {
    for (const pt of polygon[0]) {
      const [x, y] = project(pt[0], pt[1], vw, vh, bounds);
      sumX += x; sumY += y; count++;
    }
  }
  return [sumX / count, sumY / count];
}

export default function DistrictMap() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState([]);
  const [topoData, setTopoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [sectorFilter, setSectorFilter] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState([0, 0]);
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef([0, 0]);
  const panStart = useRef([0, 0]);

  useEffect(() => {
    Promise.all([
      api.get("/districts"),
      fetch("/mp_districts.json").then(r => r.json()),
    ]).then(([distRes, topo]) => {
      setDistricts(distRes.data);
      setTopoData(topo);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const geoFeatures = useMemo(() => {
    if (!topoData) return [];
    const geo = topojson.feature(topoData, topoData.objects["madhya-pradesh"]);
    return geo.features;
  }, [topoData]);

  const bounds = useMemo(() => {
    if (!geoFeatures.length) return [74, 21, 83, 27];
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const feat of geoFeatures) {
      const coords = feat.geometry.type === "Polygon" ? [feat.geometry.coordinates] : feat.geometry.coordinates;
      for (const poly of coords) {
        for (const ring of poly) {
          for (const [lon, lat] of ring) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }
    }
    const padLon = (maxLon - minLon) * 0.03;
    const padLat = (maxLat - minLat) * 0.03;
    return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
  }, [geoFeatures]);

  const districtMap = useMemo(() => {
    const map = {};
    for (const d of districts) {
      map[d.name] = d;
    }
    return map;
  }, [districts]);

  const getDistrictData = useCallback((geoName) => {
    const dbName = NAME_MAP[geoName] || geoName;
    return districtMap[dbName] || null;
  }, [districtMap]);

  const getScore = useCallback((d) => {
    if (!d) return 0;
    return sectorFilter ? (d.scores?.[sectorFilter] || 0) : d.overall_score;
  }, [sectorFilter]);

  const VW = 900, VH = 620;
  const hoveredData = hovered ? getDistrictData(hovered) : null;
  const hoveredScore = hoveredData ? getScore(hoveredData) : 0;

  const handleMouseDown = (e) => {
    dragging.current = true;
    dragStart.current = [e.clientX, e.clientY];
    panStart.current = [...pan];
  };
  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current[0];
    const dy = e.clientY - dragStart.current[1];
    setPan([panStart.current[0] + dx / zoom, panStart.current[1] + dy / zoom]);
  };
  const handleMouseUp = () => { dragging.current = false; };
  const resetView = () => { setZoom(1); setPan([0, 0]); };

  if (loading) return <div className="flex items-center justify-center h-64 font-body">{t("common.loading")}</div>;

  return (
    <div className="space-y-4" data-testid="district-map-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-mp-navy" data-testid="map-title">
            {lang === 'hi' ? 'जिला प्रदर्शन मानचित्र' : 'District Performance Map'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-body mt-0.5">
            {(districts.length || 55)} {lang === "hi" ? "ज़िले" : "districts"} — {lang === "hi" ? "विवरण के लिए होवर करें, ड्रिल डाउन के लिए क्लिक करें" : "hover for details, click to drill down"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sectorFilter} onValueChange={v => setSectorFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px] sm:w-[170px] font-body text-xs h-9" data-testid="map-sector-filter">
              <SelectValue placeholder="Overall Score" />
            </SelectTrigger>
            <SelectContent>
              {SECTORS.map(s => <SelectItem key={s.code || "all"} value={s.code || "all"}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="font-body text-xs h-9" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/districts`, "_blank")} data-testid="map-export-btn">
            <Download className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-3 border-mp-border shadow-sm overflow-hidden" data-testid="map-container">
          <CardContent className="p-1 sm:p-3 relative">
            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm" onClick={() => setZoom(z => Math.min(z * 1.3, 5))} data-testid="zoom-in-btn"><ZoomIn className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm" onClick={() => setZoom(z => Math.max(z / 1.3, 0.5))} data-testid="zoom-out-btn"><ZoomOut className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90 shadow-sm" onClick={resetView} data-testid="reset-view-btn"><Maximize2 className="w-3.5 h-3.5" /></Button>
            </div>

            <div
              className="rounded-2xl border-2 border-sky-300/70 bg-gradient-to-b from-slate-50 via-white to-slate-50/80 p-2 sm:p-3 shadow-md ring-1 ring-slate-200/90"
              data-testid="district-map-frame"
            >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="w-full h-auto select-none block rounded-xl overflow-hidden"
              style={{ minHeight: 280, cursor: dragging.current ? 'grabbing' : 'grab' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <filter id="dm-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>

              <rect x="0" y="0" width={VW} height={VH} rx="16" ry="16" fill="#FAFCFE" stroke="#0ea5e9" strokeWidth="1.75" strokeOpacity="0.45" />

              <g transform={`translate(${pan[0]},${pan[1]}) scale(${zoom})`}>
                {/* State outline shadow */}
                {geoFeatures.map((feat) => {
                  const svgPath = geoPathToSvg(feat.geometry, VW, VH, bounds);
                  return (
                    <path key={feat.properties.district + "-shadow"} d={svgPath} fill="none" stroke="#0A1930" strokeWidth={0.3 / zoom} opacity={0.1} />
                  );
                })}

                {/* District polygons */}
                {geoFeatures.map((feat) => {
                  const geoName = feat.properties.district;
                  const d = getDistrictData(geoName);
                  const score = d ? getScore(d) : 0;
                  const color = d ? getColor(score) : "#E5E7EB";
                  const isHovered = hovered === geoName;
                  const svgPath = geoPathToSvg(feat.geometry, VW, VH, bounds);
                  const dbName = NAME_MAP[geoName] || geoName;

                  return (
                    <path
                      key={geoName}
                      d={svgPath}
                      fill={color}
                      stroke={isHovered ? "#0A1930" : "#FFFFFF"}
                      strokeWidth={isHovered ? 2 / zoom : 0.8 / zoom}
                      opacity={isHovered ? 1 : (hovered ? 0.6 : 0.85)}
                      filter={isHovered ? "url(#dm-glow)" : undefined}
                      className="cursor-pointer"
                      style={{ transition: "opacity 0.2s, stroke-width 0.2s" }}
                      onMouseEnter={() => setHovered(geoName)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/districts/${dbName}`); }}
                      data-testid={`map-district-${dbName.toLowerCase().replace(/\s/g, '-')}`}
                    />
                  );
                })}

                {/* District labels */}
                {zoom >= 1 && geoFeatures.map((feat) => {
                  const geoName = feat.properties.district;
                  const d = getDistrictData(geoName);
                  if (!d) return null;
                  const [cx, cy] = getCentroid(feat.geometry, VW, VH, bounds);
                  const score = getScore(d);
                  const displayName = d ? (lang === 'hi' ? d.name_hi : d.name) : geoName;
                  const shortName = displayName.length > 8 ? displayName.slice(0, 7) + '..' : displayName;

                  return (
                    <g key={geoName + "-label"} style={{ pointerEvents: 'none' }}>
                      <text x={cx} y={cy - 3 / zoom} textAnchor="middle" dominantBaseline="middle"
                        fill="#0A1930" fontWeight="600" opacity={0.8}
                        style={{ fontSize: `${Math.max(6, 8 / zoom)}px`, fontFamily: 'IBM Plex Sans' }}>
                        {zoom >= 1.5 ? displayName : shortName}
                      </text>
                      <text x={cx} y={cy + 8 / zoom} textAnchor="middle" dominantBaseline="middle"
                        fill="#0A1930" fontWeight="700" opacity={0.6}
                        style={{ fontSize: `${Math.max(5, 7 / zoom)}px`, fontFamily: 'Outfit' }}>
                        {formatDecimal(score)}
                      </text>
                    </g>
                  );
                })}
              </g>

              <text x={VW / 2} y={VH - 6} textAnchor="middle" fill="#94A3B8" style={{ fontSize: 9, fontFamily: 'IBM Plex Sans' }}>
                {districts.length || 55} districts in vision data — {geoFeatures.length} NIC outline polygons (shapefile predates Niwari, Maihar, Pandhurna splits)
              </text>
            </svg>
            </div>
          </CardContent>
        </Card>

        {/* Info Panel */}
        <div className="space-y-4">
          {hoveredData ? (
            <Card className="border-mp-primary/30 shadow-md animate-fade-up" data-testid="map-tooltip">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getColor(hoveredScore) }} />
                  <h3 className="font-heading font-bold text-mp-navy text-base">
                    {lang === 'hi' ? hoveredData.name_hi : hoveredData.name}
                  </h3>
                </div>
                <div className="space-y-2.5 text-xs font-body">
                  <div className="flex justify-between"><span className="text-gray-500">Division</span><span className="text-mp-navy font-medium">{hoveredData.division}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Rank</span><span className="text-mp-navy font-bold">#{hoveredData.rank} / {districts.length || 55}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-500">Score</span>
                    <span className="font-heading font-bold text-xl" style={{ color: getColor(hoveredScore) }}>{formatDecimal(hoveredScore)}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Rating</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: getColor(hoveredScore) + '20', color: getColor(hoveredScore) }}>{getColorClass(hoveredScore)}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Population</span><span className="text-mp-navy font-medium">{formatDecimal(hoveredData.population / 100000)}L</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Area</span><span className="text-mp-navy font-medium">{hoveredData.area_sq_km?.toLocaleString()} sq km</span></div>
                </div>
                <Button size="sm" className="w-full mt-3 bg-mp-primary text-white font-body text-xs" onClick={() => navigate(`/dashboard/districts/${hoveredData.name}`)} data-testid="map-view-detail-btn">
                  <MapPin className="w-3 h-3 mr-1" /> View District Detail
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-mp-border shadow-sm">
              <CardContent className="p-6 text-center">
                <Info className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400 font-body">Hover over a district to see details</p>
                <p className="text-[10px] text-gray-300 font-body mt-1">Click to navigate to district page</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-mp-border shadow-sm" data-testid="map-legend">
            <CardHeader className="pb-2"><CardTitle className="font-heading text-xs text-mp-navy">Performance Legend</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {[
                { label: "Excellent (80+)", color: "#059669" },
                { label: "Good (70-80)", color: "#10B981" },
                { label: "Above Avg (60-70)", color: "#34D399" },
                { label: "Average (50-60)", color: "#FBBF24" },
                { label: "Below Avg (40-50)", color: "#F59E0B" },
                { label: "Critical (<40)", color: "#EF4444" },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-body text-gray-600">{label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-mp-border shadow-sm" data-testid="map-stats">
            <CardHeader className="pb-2"><CardTitle className="font-heading text-xs text-mp-navy">Quick Stats</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs font-body">
              {(() => {
                const scoreOf = (d) => Number(sectorFilter ? (d.scores?.[sectorFilter] ?? d.overall_score) : d.overall_score) || 0;
                const scores = districts.map(scoreOf);
                const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                const sorted = [...districts].sort((a, b) => scoreOf(b) - scoreOf(a));
                const best = sorted[0];
                const worst = sorted[sorted.length - 1];
                return (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500">Average</span><span className="font-bold text-mp-navy">{formatDecimal(avg)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Best</span><span className="font-bold text-emerald-600">{best?.name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Needs Focus</span><span className="font-bold text-red-600">{worst?.name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Districts</span><span className="font-bold text-mp-navy">{districts.length}</span></div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
