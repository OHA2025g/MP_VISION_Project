import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const { t, toggleLang, lang } = useLanguage();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name, role);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center"
        style={{
          backgroundImage: 'url(https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/b216b59ab056e786d13654e0e48b1f6bc2efa245e69c9ac4029bd6fae0106946.png)',
          backgroundSize: 'cover', backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-mp-navy/70" />
        <div className="relative z-10 p-12 text-white max-w-lg">
          <img
            src="https://static.prod-images.emergentagent.com/jobs/540e4bf0-da3b-4997-bf36-74c033323e99/images/e44e2a491d90d671520c63431a1fc71f1bd1529ac3404c890a470d0a09436854.png"
            alt="Logo" className="w-16 h-16 rounded-xl mb-6"
          />
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4 leading-tight">
            {t("app.subtitle")}
          </h1>
          <p className="font-body text-white/70 text-lg mb-8">{t("app.tagline")}</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { year: "2029", label: lang === 'hi' ? "अल्पकालिक" : "Short Term" },
              { year: "2036", label: lang === 'hi' ? "मध्यकालिक" : "Mid Term" },
              { year: "2047", label: lang === 'hi' ? "दीर्घकालिक" : "Long Term" },
            ].map(({ year, label }) => (
              <div key={year} className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-center">
                <p className="font-heading font-bold text-2xl text-mp-gold">{year}</p>
                <p className="text-xs text-white/60 font-body">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-mp-cream">
        <div className="w-full max-w-md">
          <div className="flex justify-end mb-6">
            <Button variant="ghost" size="sm" onClick={toggleLang} data-testid="login-lang-toggle">
              {t("lang.toggle")}
            </Button>
          </div>
          <div className="bg-white rounded-lg border border-mp-border p-8 shadow-sm">
            <h2 className="font-heading text-2xl font-bold text-mp-navy mb-1" data-testid="login-title">
              {isRegister ? t("login.register") : t("login.title")}
            </h2>
            <p className="text-sm text-gray-500 font-body mb-6">{t("login.subtitle")}</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4 font-body" data-testid="login-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <Label className="font-body text-sm text-mp-navy">{t("login.name")}</Label>
                  <Input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Enter full name" className="mt-1 font-body"
                    data-testid="register-name-input" required
                  />
                </div>
              )}
              <div>
                <Label className="font-body text-sm text-mp-navy">{t("login.email")}</Label>
                <Input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" className="mt-1 font-body"
                  data-testid="login-email-input" required
                />
              </div>
              <div>
                <Label className="font-body text-sm text-mp-navy">{t("login.password")}</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPass ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password" className="font-body pr-10"
                    data-testid="login-password-input" required
                  />
                  <button
                    type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {isRegister && (
                <div>
                  <Label className="font-body text-sm text-mp-navy">{t("login.role")}</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="mt-1 font-body" data-testid="register-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">{t("role.viewer")}</SelectItem>
                      <SelectItem value="department_head">{t("role.department_head")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                type="submit" disabled={loading}
                className="w-full bg-mp-primary hover:bg-mp-primary/90 text-white font-body"
                data-testid="login-submit-btn"
              >
                {loading ? t("common.loading") : (isRegister ? t("login.register") : t("login.submit"))}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <p className="text-center text-sm text-gray-500 font-body mt-4">
              {isRegister ? t("login.switch_login") : t("login.switch_register")}{" "}
              <button
                onClick={() => { setIsRegister(!isRegister); setError(""); }}
                className="text-mp-primary font-medium hover:underline"
                data-testid="toggle-auth-mode-btn"
              >
                {isRegister ? t("login.title") : t("login.register")}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
