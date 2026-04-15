import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Globe, User, LogOut, ChevronDown, Menu } from "lucide-react";

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { t, toggleLang } = useLanguage();

  const roleBadge = {
    admin: "bg-mp-primary/10 text-mp-primary",
    department_head: "bg-mp-gold/10 text-mp-darkgold",
    viewer: "bg-gray-100 text-gray-600"
  };

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-mp-cream/90 border-b border-mp-border px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2" data-testid="navbar">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={onToggleSidebar} data-testid="mobile-menu-btn">
          <Menu className="w-5 h-5 text-mp-navy" />
        </Button>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-mp-navy text-sm sm:text-lg truncate" data-testid="page-title">{t("app.title")}</h2>
          <p className="text-[10px] sm:text-xs text-gray-500 font-body hidden sm:block">{t("app.tagline")}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={toggleLang} className="border-mp-border text-mp-navy hover:bg-mp-primary/5 font-body h-8 px-2 sm:px-3" data-testid="lang-toggle-btn">
          <Globe className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">{t("lang.toggle")}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-1.5 font-body h-8" data-testid="user-menu-btn">
              <div className="w-7 h-7 rounded-full bg-mp-navy flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-medium text-mp-navy leading-tight">{user?.name}</p>
                <span className={`text-[9px] px-1 py-0.5 rounded-full ${roleBadge[user?.role] || ''}`}>{t(`role.${user?.role}`)}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-sm font-body" data-testid="user-email-item">{user?.email}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 font-body" data-testid="logout-btn">
              <LogOut className="w-4 h-4 mr-2" />{t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
