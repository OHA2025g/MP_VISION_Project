import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Target, MapPin, Users, TrendingUp, ArrowRight, Globe, Play,
  Sprout, GraduationCap, Heart, Shield, Factory, Building2,
  TreePine, BarChart3, Layers, ChevronRight, ExternalLink, Menu, X
} from "lucide-react";
import { motion } from "framer-motion";
import * as topojson from "topojson-client";
import { formatDecimal } from "@/lib/utils";

const SECTOR_ICONS = { AGR: Sprout, ECO: TrendingUp, EDU: GraduationCap, ENV: TreePine, GOV: Shield, IND: Factory, INF: Building2, HLT: Heart, SOC: Users, PMU: BarChart3 };

const NEWS_ITEMS = [
  { category: "Flagship Program", categoryHi: "प्रमुख कार्यक्रम", color: "#E65100", title: "Ladli Behna Yojana Reaches 1.29 Crore Women", titleHi: "लाडली बहना योजना 1.29 करोड़ महिलाओं तक पहुंची", desc: "Monthly financial assistance of Rs 1,250 to eligible women across Madhya Pradesh, empowering rural households.", date: "February 2026" },
  { category: "Economic Growth", categoryHi: "आर्थिक विकास", color: "#1565C0", title: "MP GSDP Crosses Rs 15 Lakh Crore Mark", titleHi: "एमपी जीएसडीपी 15 लाख करोड़ रुपये का आंकड़ा पार", desc: "State economy shows strong growth trajectory, on track for doubling per capita income by 2036.", date: "January 2026" },
  { category: "Infrastructure", categoryHi: "अवसंरचना", color: "#00838F", title: "Smart Cities Mission: 7 Cities Transforming", titleHi: "स्मार्ट सिटी मिशन: 7 शहरों का कायाकल्प", desc: "Bhopal, Indore, Jabalpur, Gwalior, Ujjain, Satna and Sagar undergoing major urban transformation.", date: "December 2025" },
];

const SECTOR_LABELS = {
  AGR: "Agriculture",
  ECO: "Economy",
  EDU: "Education",
  ENV: "Environment",
  GOV: "Governance",
  IND: "Industry",
  INF: "Infrastructure",
  HLT: "Health",
  SOC: "Social",
  PMU: "PMU",
};

function getColor(score) {
  if (score >= 80) return "#059669";
  if (score >= 70) return "#10B981";
  if (score >= 60) return "#34D399";
  if (score >= 50) return "#FBBF24";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function project(lon, lat, vw, vh, bounds) {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const pad = 15;
  return [pad + ((lon - minLon) / (maxLon - minLon)) * (vw - 2 * pad), pad + ((maxLat - lat) / (maxLat - minLat)) * (vh - 2 * pad)];
}

function geoPathToSvg(geometry, vw, vh, bounds) {
  const paths = [];
  const coords = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of coords) { for (const ring of polygon) { let d = ""; for (let i = 0; i < ring.length; i++) { const [x, y] = project(ring[i][0], ring[i][1], vw, vh, bounds); d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1); } paths.push(d + "Z"); } }
  return paths.join(" ");
}

// Census / topo names → portal DB names (Niwari is its own district; do not map to Mauganj)
const NAME_MAP = { Hoshangabad: "Narmadapuram", Narsimhapur: "Narsinghpur" };

function MiniMap({ districts, districtCount }) {
  const [topoData, setTopoData] = useState(null);
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  useEffect(() => { fetch("/mp_districts.json").then(r => r.json()).then(setTopoData).catch(() => {}); }, []);
  const geoFeatures = useMemo(() => topoData ? topojson.feature(topoData, topoData.objects["madhya-pradesh"]).features : [], [topoData]);
  const bounds = useMemo(() => {
    if (!geoFeatures.length) return [74, 21, 83, 27];
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const f of geoFeatures) { const cs = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates; for (const p of cs) for (const r of p) for (const [lo, la] of r) { if (lo < minLon) minLon = lo; if (la < minLat) minLat = la; if (lo > maxLon) maxLon = lo; if (la > maxLat) maxLat = la; } }
    return [minLon - 0.2, minLat - 0.2, maxLon + 0.2, maxLat + 0.2];
  }, [geoFeatures]);
  const distMap = useMemo(() => { const m = {}; (districts || []).forEach(d => { m[d.name] = d; }); return m; }, [districts]);
  const VW = 700, VH = 500;
  const hoveredD = hovered ? distMap[NAME_MAP[hovered] || hovered] : null;
  const totalDistricts = districtCount ?? (districts?.length || 55);
  const avgVision = useMemo(() => {
    const list = districts || [];
    if (!list.length) return formatDecimal(0);
    const sum = list.reduce((a, d) => a + (Number(d?.overall_score) || 0), 0);
    return formatDecimal(sum / list.length);
  }, [districts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div
          className="rounded-2xl border-2 border-sky-300/70 bg-gradient-to-b from-slate-50 via-white to-slate-50/80 p-3 sm:p-4 shadow-md ring-1 ring-slate-200/90"
          data-testid="landing-map-frame"
        >
          <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto block rounded-xl overflow-hidden">
            <rect x="0" y="0" width={VW} height={VH} rx="14" ry="14" fill="#FAFCFE" stroke="#0ea5e9" strokeWidth="1.75" strokeOpacity="0.45" />
          {geoFeatures.map(f => {
            const gn = f.properties.district;
            const d = distMap[NAME_MAP[gn] || gn];
            const score = d?.overall_score || 0;
            const isH = hovered === gn;
            return <path key={gn} d={geoPathToSvg(f.geometry, VW, VH, bounds)} fill={d ? getColor(score) : "#E5E7EB"} stroke={isH ? "#0A1930" : "#FFF"} strokeWidth={isH ? 2 : 0.6} opacity={isH ? 1 : (hovered ? 0.55 : 0.8)} className="cursor-pointer" style={{ transition: "all 0.2s" }} onMouseEnter={() => setHovered(gn)} onMouseLeave={() => setHovered(null)} onClick={() => d && navigate(`/login`)} />;
          })}
          <g transform={`translate(${VW - 24}, 10)`} style={{ pointerEvents: "none" }} textAnchor="end">
            <text x={0} y={12} fill="#475569" style={{ fontSize: 10, fontFamily: "Outfit", fontWeight: 600 }}>Vision Score</text>
            {[{ l: "70+ Excellent", c: "#059669" }, { l: "50-69 Good", c: "#FBBF24" }, { l: "35-49 Average", c: "#F59E0B" }, { l: "&lt;35 Needs Focus", c: "#EF4444" }].map(({ l, c }, i) => (
              <g key={l} transform={`translate(0,${28 + i * 16})`}>
                <text x={0} y={4} fill="#64748B" style={{ fontSize: 9, fontFamily: "IBM Plex Sans" }}>{l.replace("&lt;", "<")}</text>
                <circle r={5} cx={10} cy={1} fill={c} />
              </g>
            ))}
          </g>
        </svg>
        </div>
      </div>
      <div className="space-y-4">
        <Card className="border-mp-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-mp-orange animate-pulse" />
              <h3 className="font-heading font-bold text-mp-navy text-sm">District Vision Insights</h3>
            </div>
            {hoveredD ? (
              <div>
                <p className="font-heading font-bold text-mp-navy text-lg mb-3">{hoveredD.name}</p>
                <div className="space-y-2 text-xs font-body">
                  {Object.entries(hoveredD.scores || {}).slice(0, 6).map(([code, score]) => (
                    <div key={code} className="flex justify-between items-center">
                      <span className="text-gray-500">{SECTOR_LABELS[code] || code}</span>
                      <span className="font-heading font-bold text-mp-navy">{formatDecimal(score)}</span>
                    </div>
                  ))}
                </div>
                <Button size="sm" className="w-full mt-4 bg-mp-orange hover:bg-mp-orange/90 text-white font-body text-xs" onClick={() => navigate("/login")} data-testid="map-view-report-btn">
                  View District Report <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 font-body">Hover a district on the map to see insights</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-mp-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-mp-primary" />
              <h3 className="font-heading font-bold text-mp-navy text-sm">State Overview</h3>
            </div>
            <div className="space-y-2.5 text-xs font-body">
              <div className="flex justify-between"><span className="text-gray-500">Total Districts</span><span className="font-heading font-bold text-mp-navy">{totalDistricts}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg Vision Score</span><span className="font-heading font-bold text-mp-primary">{avgVision}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Districts On Track</span><span className="font-heading font-bold text-emerald-600">{(districts || []).filter(d => (Number(d?.overall_score) || 0) >= 60).length}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { t, lang, toggleLang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const isHi = lang === 'hi';

  useEffect(() => {
    Promise.all([
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/stats`).then(r => r.json()),
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/districts`).then(r => r.json()),
    ]).then(([s, d]) => { setStats(s); setDistricts(d); }).catch(console.error);
  }, []);

  const goToDashboard = () => navigate(user ? "/dashboard" : "/login");

  return (
    <div className="min-h-screen bg-mp-cream" data-testid="landing-page">
      {/* === NAVBAR === */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-lg border-b border-mp-border/50 shadow-sm" data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2.5">
            <img src="https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/e44e2a491d90d671520c63431a1fc71f1bd1529ac3404c890a470d0a09436854.png" alt="Logo" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg" />
            <div><p className="font-heading font-bold text-mp-navy text-sm sm:text-base leading-tight">MP Vision 2047</p><p className="text-[9px] text-gray-400 font-body hidden sm:block">Department of Planning</p></div>
          </div>
          <div className="hidden lg:flex items-center gap-6 text-sm font-body text-gray-600">
            <a href="#home" className="hover:text-mp-navy transition-colors">Home</a>
            <a href="#pillars" className="hover:text-mp-navy transition-colors">{isHi ? 'क्षेत्रीय स्तंभ' : 'Sectoral Pillars'}</a>
            <a href="#map" className="hover:text-mp-navy transition-colors">{isHi ? 'जिला मानचित्र' : 'District Map'}</a>
            <a href="#updates" className="hover:text-mp-navy transition-colors">{isHi ? 'अपडेट' : 'Updates'}</a>
            <button onClick={toggleLang} className="flex items-center gap-1 hover:text-mp-navy"><Globe className="w-3.5 h-3.5" />{t("lang.toggle")}</button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-mp-primary hover:bg-mp-primary/90 text-white font-body text-xs sm:text-sm rounded-full px-3 sm:px-5 hidden sm:flex" onClick={goToDashboard} data-testid="landing-explore-btn">
              {isHi ? 'डैशबोर्ड देखें' : 'View Dashboard'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
            <Button size="sm" variant="outline" className="font-body text-xs sm:text-sm rounded-full px-3 sm:px-4 border-mp-navy text-mp-navy" onClick={() => navigate("/login")} data-testid="landing-signin-btn">
              Sign In
            </Button>
            <button className="lg:hidden p-1.5" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        {mobileMenu && (
          <div className="lg:hidden border-t border-mp-border bg-white p-4 space-y-3 text-sm font-body">
            <a href="#home" className="block text-gray-600" onClick={() => setMobileMenu(false)}>Home</a>
            <a href="#pillars" className="block text-gray-600" onClick={() => setMobileMenu(false)}>Sectoral Pillars</a>
            <a href="#map" className="block text-gray-600" onClick={() => setMobileMenu(false)}>District Map</a>
            <a href="#updates" className="block text-gray-600" onClick={() => setMobileMenu(false)}>Updates</a>
            <button onClick={() => { toggleLang(); setMobileMenu(false); }} className="text-gray-600"><Globe className="w-3.5 h-3.5 inline mr-1" />{t("lang.toggle")}</button>
            <Button size="sm" className="w-full bg-mp-primary text-white font-body" onClick={() => { goToDashboard(); setMobileMenu(false); }}>View Dashboard</Button>
          </div>
        )}
      </nav>

      {/* === HERO === */}
      <section id="home" className="relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 bg-gradient-to-b from-mp-cream via-white to-mp-cream" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-10 sm:pb-16 text-center">
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="font-heading font-extrabold text-mp-navy text-3xl sm:text-5xl lg:text-7xl leading-tight tracking-tight" data-testid="hero-title">
            {isHi ? 'मध्य प्रदेश' : 'Madhya Pradesh'}{" "}
            <span className="text-mp-primary">{isHi ? 'विज़न 2029' : 'Vision 2029'}</span><br className="hidden sm:block" />
            {isHi ? ' & ' : ', '}<span className="text-mp-gold">{isHi ? '2036 एवं 2047' : '2036 & 2047'}</span>{" "}
            {isHi ? 'पोर्टल' : 'Portal'}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-4 text-base sm:text-lg text-gray-600 font-body font-medium">
            {isHi ? 'डेटा-संचालित शासन के माध्यम से समृद्ध मध्य प्रदेश' : 'Samriddh Madhya Pradesh Through Data-Driven Governance'}
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-2 text-sm text-gray-400 font-body max-w-2xl mx-auto px-4">
            {isHi
              ? '10 क्षेत्रीय स्तंभों में 620 केपीआई की व्यापक निगरानी, आत्मनिर्भर और विकसित मध्य प्रदेश की दिशा में प्रगति ट्रैकिंग।'
              : 'Comprehensive monitoring of 620 KPIs across 10 sectoral pillars, tracking progress towards an Atmanirbhar and Viksit Madhya Pradesh.'}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Button size="lg" className="bg-mp-primary hover:bg-mp-primary/90 text-white font-body rounded-full px-6 sm:px-8 text-sm sm:text-base shadow-lg shadow-mp-primary/20" onClick={goToDashboard} data-testid="hero-explore-btn">
              {isHi ? 'PMIS डैशबोर्ड देखें' : 'Explore PMIS Dashboard'} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="font-body rounded-full px-6 sm:px-8 text-sm sm:text-base border-mp-navy/20 text-mp-navy" onClick={() => navigate("/login")} data-testid="hero-signin-btn">
              <Play className="w-4 h-4 mr-2 fill-current" /> {isHi ? 'साइन इन करें' : 'Sign In'}
            </Button>
          </motion.div>

          {/* Stats cards */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-10 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto" data-testid="hero-stats">
            {[
              { icon: Target, value: stats?.total_kpis || 620, label: isHi ? "केपीआई ट्रैक किए" : "KPIs Tracked" },
              { icon: MapPin, value: stats?.districts_count ?? 55, label: isHi ? "जिले कवर" : "Districts Covered" },
              { icon: Layers, value: stats?.sectors?.length || 10, label: isHi ? "क्षेत्रीय स्तंभ" : "Sectoral Pillars" },
              { icon: Users, value: "8.4Cr+", label: isHi ? "जनसंख्या" : "Population Served" },
            ].map(({ icon: Icon, value, label }, i) => (
              <Card key={label} className="border-mp-border/50 shadow-sm bg-white/80 backdrop-blur-sm" data-testid={`hero-stat-${i}`}>
                <CardContent className="p-4 sm:p-5 text-center">
                  <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-mp-primary mx-auto mb-2 opacity-60" />
                  <p className="text-2xl sm:text-3xl font-heading font-bold text-mp-navy">{value}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 font-body mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === SECTORAL PILLARS === */}
      <section id="pillars" className="bg-mp-navy py-12 sm:py-16" data-testid="pillars-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-white text-2xl sm:text-3xl lg:text-4xl">{isHi ? '10 क्षेत्रीय स्तंभ' : '10 Sectoral Pillars'}</h2>
          <p className="text-sm sm:text-base text-white/60 font-body mt-2 max-w-xl mx-auto">{isHi ? 'लक्षित विकास क्षेत्रों के माध्यम से मध्य प्रदेश के परिवर्तन को संचालित करने वाला व्यापक ढांचा' : 'Comprehensive framework driving MP\'s transformation through focused development areas'}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-8 sm:mt-10">
            {(stats?.sectors || []).map((s, i) => {
              const Icon = SECTOR_ICONS[s.code] || Layers;
              return (
                <motion.div key={s.code} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-5 hover:bg-white/15 transition-all cursor-pointer group" onClick={goToDashboard} data-testid={`pillar-${s.code}`}>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white/80" />
                    </div>
                    <p className="font-heading font-medium text-white text-xs sm:text-sm">{isHi ? s.name_hi : s.name}</p>
                    <p className="text-[10px] text-white/40 font-body mt-1">{s.kpi_count} KPIs</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === DISTRICT PERFORMANCE MAP === */}
      <section id="map" className="py-12 sm:py-16" data-testid="map-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-mp-primary/10 text-mp-primary text-xs font-body font-medium">
              <MapPin className="w-3 h-3" /> Performance Map
            </span>
            <h2 className="font-heading font-bold text-mp-navy text-2xl sm:text-3xl lg:text-4xl mt-3">{isHi ? 'मध्य प्रदेश जिला प्रदर्शन' : 'MP District Performance'}</h2>
            <p className="text-sm text-gray-500 font-body mt-2">{isHi ? `${stats?.districts_count ?? 55} जिलों में विज़न स्कोर ट्रैकिंग — अंतर्दृष्टि के लिए किसी भी जिले पर क्लिक करें` : `Vision score tracking across ${stats?.districts_count ?? 55} districts — click any district to view insights`}</p>
          </div>
          <MiniMap districts={districts} districtCount={(stats?.districts_count ?? districts?.length) || 55} />
        </div>
      </section>

      {/* === VISION UPDATES === */}
      <section id="updates" className="py-12 sm:py-16 bg-gradient-to-b from-mp-cream to-white" data-testid="updates-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <h2 className="font-heading font-bold text-mp-navy text-2xl sm:text-3xl lg:text-4xl">{isHi ? 'विज़न योजनाएं एवं अपडेट' : 'Vision Schemes & Updates'}</h2>
            <p className="text-sm text-gray-500 font-body mt-2">{isHi ? 'मध्य प्रदेश विज़न 2047 की नवीनतम उपलब्धियां और मील के पत्थर' : 'Latest achievements and milestones from MP Vision 2047'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {NEWS_ITEMS.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="border-mp-border/50 shadow-sm h-full hover:shadow-md transition-shadow" data-testid={`news-card-${i}`}>
                  <CardContent className="p-5 sm:p-6 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-body font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: item.color }}>
                        {isHi ? item.categoryHi : item.category}
                      </span>
                      <span className="text-[10px] text-gray-400 font-body">{item.date}</span>
                    </div>
                    <h3 className="font-heading font-bold text-mp-navy text-base sm:text-lg leading-snug mb-2">{isHi ? item.titleHi : item.title}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 font-body flex-1">{item.desc}</p>
                    <button className="mt-4 text-xs font-body font-medium text-mp-primary flex items-center gap-1 hover:underline">
                      Read Full Story <ExternalLink className="w-3 h-3" />
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* === STRATEGIC PARTNERSHIPS === */}
      <section className="py-12 sm:py-16" data-testid="partnerships-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-mp-navy text-2xl sm:text-3xl lg:text-4xl">{isHi ? 'रणनीतिक साझेदारी' : 'Strategic Partnerships'}</h2>
          <p className="text-sm text-gray-500 font-body mt-2 max-w-lg mx-auto">{isHi ? 'मध्य प्रदेश के विकास और विकास के लिए समर्पित संगठनों के साथ सहयोग' : 'Collaborating with organizations dedicated to Madhya Pradesh\'s development and growth'}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-8 sm:mt-10 max-w-4xl mx-auto">
            {[
              { value: "10", label: isHi ? "क्षेत्रीय स्तंभ" : "Sectoral Pillars" },
              { value: "620", label: isHi ? "कुल केपीआई" : "Total KPIs" },
              { value: String((stats?.districts_count ?? districts.length) || 55), label: isHi ? "जिले" : "Districts" },
              { value: `${formatDecimal(stats?.progress_pct ?? 54)}%`, label: isHi ? "प्रगति" : "On Track" },
            ].map(({ value, label }) => (
              <div key={label} className="bg-mp-navy rounded-xl p-5 sm:p-6 text-center">
                <p className="text-2xl sm:text-3xl font-heading font-bold text-mp-primary">{value}</p>
                <p className="text-xs text-white/50 font-body mt-1">{label}</p>
              </div>
            ))}
          </div>
          <Button size="lg" className="mt-8 sm:mt-10 bg-mp-primary hover:bg-mp-primary/90 text-white font-body rounded-full px-8 text-sm sm:text-base shadow-lg shadow-mp-primary/20" onClick={goToDashboard} data-testid="cta-access-btn">
            {isHi ? 'विज़न पोर्टल एक्सेस करें' : 'Access Vision Portal'} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="bg-mp-navy py-6 sm:py-8 border-t border-white/5" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/e44e2a491d90d671520c63431a1fc71f1bd1529ac3404c890a470d0a09436854.png" alt="Logo" className="w-7 h-7 rounded-lg" />
            <span className="text-xs text-white/60 font-body">Government of Madhya Pradesh - PMIS v1.0</span>
          </div>
          <span className="text-[10px] text-white/30 font-body">2026 Department of Planning, Economics & Statistics</span>
        </div>
      </footer>
    </div>
  );
}
