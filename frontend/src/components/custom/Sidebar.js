import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Crown, Search, MapPin, Clock, Sparkles, Settings, Map,
  BarChart3, ChevronDown, ChevronRight, X
} from "lucide-react";
import { useState } from "react";

const SECTOR_NAV = [
  { code: "AGR", label: "Agriculture", labelHi: "कृषि", color: "#4CAF50" },
  { code: "ECO", label: "Economy", labelHi: "अर्थव्यवस्था", color: "#1565C0" },
  { code: "EDU", label: "Education", labelHi: "शिक्षा", color: "#FF8F00" },
  { code: "ENV", label: "Environment", labelHi: "पर्यावरण", color: "#2E7D32" },
  { code: "GOV", label: "Governance", labelHi: "शासन", color: "#5E35B1" },
  { code: "IND", label: "Industry", labelHi: "उद्योग", color: "#E65100" },
  { code: "INF", label: "Infrastructure", labelHi: "अवसंरचना", color: "#00838F" },
  { code: "HLT", label: "Health", labelHi: "स्वास्थ्य", color: "#C62828" },
  { code: "SOC", label: "Social", labelHi: "सामाजिक", color: "#6A1B9A" },
  { code: "PMU", label: "PMU", labelHi: "पीएमयू", color: "#37474F" },
];

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-all duration-200 ${isActive ? 'bg-mp-primary text-white font-medium shadow-md shadow-mp-primary/20' : 'text-white/60 hover:text-white hover:bg-white/5'}`;

export default function Sidebar({ open, onClose }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const isHindi = lang === 'hi';
  const roleName = user?.role === 'admin' ? (isHindi ? 'व्यवस्थापक' : 'Admin')
    : user?.role === 'department_head' ? (isHindi ? 'विभाग प्रमुख' : 'Dept Head')
    : (isHindi ? 'दर्शक' : 'Viewer');

  const handleNav = () => { if (window.innerWidth < 1024) onClose?.(); };

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 w-64 bg-mp-navy text-white flex flex-col z-50 transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      data-testid="sidebar"
      style={{
        backgroundImage: `url(https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/605eb9eef15dda5cdbb4d2b508fa92a0db73a1d0bb84218c752bb52e15c086c2.png)`,
        backgroundSize: '200px', backgroundRepeat: 'repeat', backgroundBlendMode: 'soft-light',
      }}
    >
      <div className="bg-mp-navy/95 flex flex-col h-full">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/e44e2a491d90d671520c63431a1fc71f1bd1529ac3404c890a470d0a09436854.png"
              alt="MP Vision" className="w-9 h-9 rounded-lg" data-testid="sidebar-logo" />
            <div>
              <h1 className="font-heading font-bold text-sm leading-tight">{t("app.subtitle")}</h1>
              <p className="text-[9px] text-white/40 font-body tracking-wider uppercase">PMIS Dashboard</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-white/50 hover:text-white" data-testid="sidebar-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-3 mt-3 mb-1 p-2.5 rounded-lg bg-mp-primary/15 border border-mp-primary/20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-mp-primary/30 flex items-center justify-center">
              <Crown className="w-3.5 h-3.5 text-mp-gold" />
            </div>
            <div>
              <p className="text-[9px] text-white/50 font-body uppercase tracking-wider">Logged in as</p>
              <p className="text-xs font-heading font-semibold text-white">{roleName}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-auto scrollbar-thin" data-testid="sidebar-nav">
          <p className="text-[9px] text-white/25 uppercase tracking-[0.2em] font-body px-3 pt-2 pb-1">Main Menu</p>

          <NavLink to="/dashboard" end className={navLinkClass} data-testid="nav-dashboard" onClick={handleNav}>
            <Crown className="w-4 h-4 shrink-0" /><span>CM Dashboard</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
          </NavLink>

          <button onClick={() => setSectorsOpen(!sectorsOpen)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-white/60 hover:text-white hover:bg-white/5 transition-all" data-testid="nav-sectors-toggle">
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>{isHindi ? 'क्षेत्रीय डैशबोर्ड' : 'Sectoral Dashboards'}</span>
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${sectorsOpen ? '' : '-rotate-90'}`} />
          </button>

          {sectorsOpen && (
            <div className="pl-3 space-y-0.5">
              {SECTOR_NAV.map(({ code, label, labelHi, color }) => (
                <NavLink key={code} to={`/dashboard/sectors/${code}`} onClick={handleNav}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-body transition-all duration-200 ${isActive ? 'bg-white/10 text-white font-medium' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
                  data-testid={`nav-sector-${code.toLowerCase()}`}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate">{isHindi ? labelHi : label}</span>
                </NavLink>
              ))}
            </div>
          )}

          <div className="pt-2" />

          <NavLink to="/dashboard/kpi-explorer" className={navLinkClass} data-testid="nav-kpi_explorer" onClick={handleNav}>
            <Search className="w-4 h-4 shrink-0" /><span>{isHindi ? 'केपीआई एक्सप्लोरर' : 'KPIs & Outcomes'}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
          </NavLink>

          <NavLink to="/dashboard/districts" className={navLinkClass} data-testid="nav-districts" onClick={handleNav}>
            <MapPin className="w-4 h-4 shrink-0" /><span>{isHindi ? 'जिला प्रदर्शन' : 'District Performance'}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
          </NavLink>

          <NavLink to="/dashboard/district-map" className={navLinkClass} data-testid="nav-map" onClick={handleNav}>
            <Map className="w-4 h-4 shrink-0" /><span>{isHindi ? 'जिला मानचित्र' : 'District Map'}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
          </NavLink>

          <NavLink to="/dashboard/timeline" className={navLinkClass} data-testid="nav-timeline" onClick={handleNav}>
            <Clock className="w-4 h-4 shrink-0" /><span>{isHindi ? 'विज़न टाइमलाइन' : 'Vision Timeline'}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
          </NavLink>
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          {user?.role === "admin" && (
            <NavLink to="/dashboard/admin" onClick={handleNav} className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-all ${isActive ? 'bg-mp-gold/20 text-mp-gold font-medium' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`} data-testid="nav-admin">
              <Settings className="w-4 h-4" /><span>{isHindi ? 'सेटिंग्स' : 'Admin Panel'}</span>
            </NavLink>
          )}
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-white/20 font-body">
            <Sparkles className="w-3 h-3" /><span>Powered by AI</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
