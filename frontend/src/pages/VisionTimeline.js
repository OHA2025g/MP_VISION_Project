import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Target, TrendingUp, Flag, Star } from "lucide-react";

const MILESTONES = [
  {
    year: "2029",
    title_en: "Short Term Goals",
    title_hi: "अल्पकालिक लक्ष्य",
    description_en: "Foundation building phase with focus on immediate improvements in governance, basic infrastructure, and social indicators.",
    description_hi: "शासन, बुनियादी ढांचे और सामाजिक संकेतकों में तत्काल सुधार पर ध्यान केंद्रित करते हुए नींव निर्माण चरण।",
    color: "#0CA4E8",
    icon: Target,
    targets_en: [
      "GSDP Growth: 10%", "Literacy Rate: 82%", "Irrigation Coverage: 60%",
      "e-Governance Adoption: 80%", "Renewable Energy: 45%", "IMR: 25 per 1000",
      "MSME Registration Growth: 20%", "Rural Road Connectivity: 95%"
    ],
    targets_hi: [
      "जीएसडीपी वृद्धि: 10%", "साक्षरता दर: 82%", "सिंचाई कवरेज: 60%",
      "ई-शासन अपनाना: 80%", "नवीकरणीय ऊर्जा: 45%", "आईएमआर: 25 प्रति 1000",
      "एमएसएमई पंजीकरण वृद्धि: 20%", "ग्रामीण सड़क संपर्क: 95%"
    ]
  },
  {
    year: "2036",
    title_en: "Mid Term Goals",
    title_hi: "मध्यकालिक लक्ष्य",
    description_en: "Acceleration phase targeting significant economic growth, universal service delivery, and technological transformation.",
    description_hi: "महत्वपूर्ण आर्थिक विकास, सार्वभौमिक सेवा वितरण और तकनीकी परिवर्तन को लक्षित करते हुए त्वरण चरण।",
    color: "#D4AF37",
    icon: TrendingUp,
    targets_en: [
      "GSDP Growth: 12%", "Literacy Rate: 90%", "Irrigation Coverage: 75%",
      "e-Governance Adoption: 92%", "Renewable Energy: 65%", "IMR: 15 per 1000",
      "Manufacturing GVA Share: 20%", "Water Supply Coverage: 90%"
    ],
    targets_hi: [
      "जीएसडीपी वृद्धि: 12%", "साक्षरता दर: 90%", "सिंचाई कवरेज: 75%",
      "ई-शासन अपनाना: 92%", "नवीकरणीय ऊर्जा: 65%", "आईएमआर: 15 प्रति 1000",
      "विनिर्माण जीवीए हिस्सा: 20%", "जल आपूर्ति कवरेज: 90%"
    ]
  },
  {
    year: "2047",
    title_en: "Long Term Vision",
    title_hi: "दीर्घकालिक विज़न",
    description_en: "Full transformation into a high-growth, inclusive, sustainable, and technology-driven state aligned with Viksit Bharat.",
    description_hi: "विकसित भारत के अनुरूप एक उच्च-विकास, समावेशी, टिकाऊ और प्रौद्योगिकी-संचालित राज्य में पूर्ण परिवर्तन।",
    color: "#E65100",
    icon: Star,
    targets_en: [
      "GSDP Growth: 14%", "Literacy Rate: 98%", "Irrigation Coverage: 90%",
      "e-Governance Adoption: 99%", "Renewable Energy: 85%", "IMR: 5 per 1000",
      "Per Capita Income: ₹8 Lakh", "Life Expectancy: 76 Years"
    ],
    targets_hi: [
      "जीएसडीपी वृद्धि: 14%", "साक्षरता दर: 98%", "सिंचाई कवरेज: 90%",
      "ई-शासन अपनाना: 99%", "नवीकरणीय ऊर्जा: 85%", "आईएमआर: 5 प्रति 1000",
      "प्रति व्यक्ति आय: ₹8 लाख", "जीवन प्रत्याशा: 76 वर्ष"
    ]
  }
];

export default function VisionTimeline() {
  const { t, lang } = useLanguage();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get("/dashboard/overview").then(r => setOverview(r.data)).catch(console.error);
  }, []);

  const totalKpis = overview?.total_kpis || 80;
  const onTrack = overview?.kpi_status?.on_track || 0;
  const overallProgress = Math.round((onTrack / totalKpis) * 100);

  return (
    <div className="space-y-8" data-testid="vision-timeline-page">
      <div className="text-center">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-mp-navy" data-testid="timeline-title">
          {t("timeline.title")}
        </h1>
        <p className="text-base text-gray-500 font-body mt-2 max-w-2xl mx-auto">{t("timeline.subtitle")}</p>
      </div>

      <Card className="border-mp-border shadow-sm" data-testid="overall-progress-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-body">Overall Vision Progress</p>
              <p className="font-heading text-2xl font-bold text-mp-navy">{overallProgress}%</p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="font-heading text-xl font-bold text-emerald-600">{overview?.kpi_status?.on_track || 0}</p>
                <p className="text-[10px] text-gray-400 font-body">{t("status.on_track")}</p>
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-amber-500">{overview?.kpi_status?.at_risk || 0}</p>
                <p className="text-[10px] text-gray-400 font-body">{t("status.at_risk")}</p>
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-red-500">{overview?.kpi_status?.off_track || 0}</p>
                <p className="text-[10px] text-gray-400 font-body">{t("status.off_track")}</p>
              </div>
            </div>
          </div>
          <Progress value={overallProgress} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-gray-400 font-body">
            <span>2024 (Baseline)</span>
            <span>2029</span>
            <span>2036</span>
            <span>2047 (Vision)</span>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-mp-border -translate-x-1/2 hidden lg:block" />
        <div className="space-y-12">
          {MILESTONES.map((milestone, i) => {
            const Icon = milestone.icon;
            const isLeft = i % 2 === 0;
            const targets = lang === 'hi' ? milestone.targets_hi : milestone.targets_en;
            return (
              <motion.div
                key={milestone.year}
                initial={{ opacity: 0, x: isLeft ? -40 : 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.2, duration: 0.5 }}
                className={`flex flex-col lg:flex-row items-center gap-6 ${isLeft ? '' : 'lg:flex-row-reverse'}`}
                data-testid={`milestone-${milestone.year}`}
              >
                <div className={`flex-1 ${isLeft ? 'lg:text-right' : 'lg:text-left'}`}>
                  <Card className="border-mp-border shadow-sm hover:shadow-md transition-shadow inline-block w-full max-w-md">
                    <CardHeader className="pb-2">
                      <div className={`flex items-center gap-3 ${isLeft ? 'lg:flex-row-reverse' : ''}`}>
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: milestone.color }}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="font-heading text-lg text-mp-navy">
                            {lang === 'hi' ? milestone.title_hi : milestone.title_en}
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-gray-500 font-body">
                        {lang === 'hi' ? milestone.description_hi : milestone.description_en}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {targets.map((target, j) => (
                          <Badge key={j} variant="outline" className="text-[10px] font-body border-mp-border text-mp-navy">
                            {target}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="relative z-10 flex flex-col items-center shrink-0">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-heading font-bold text-lg shadow-lg"
                    style={{ backgroundColor: milestone.color }}
                  >
                    {milestone.year}
                  </div>
                </div>

                <div className="flex-1 hidden lg:block" />
              </motion.div>
            );
          })}
        </div>
      </div>

      <Card className="border-mp-border shadow-sm" data-testid="vision-themes-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg text-mp-navy">
            {lang === 'hi' ? 'विज़न विषय' : 'Vision Themes'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { en: "Economic Growth & Industrialization", hi: "आर्थिक विकास एवं औद्योगीकरण", color: "#1565C0" },
              { en: "Human Capital Development", hi: "मानव पूंजी विकास", color: "#FF8F00" },
              { en: "Infrastructure Expansion", hi: "अवसंरचना विस्तार", color: "#00838F" },
              { en: "Digital Transformation", hi: "डिजिटल परिवर्तन", color: "#5E35B1" },
              { en: "Social Inclusion", hi: "सामाजिक समावेशन", color: "#6A1B9A" },
              { en: "Environmental Sustainability", hi: "पर्यावरणीय स्थिरता", color: "#2E7D32" },
            ].map(({ en, hi, color }) => (
              <div key={en} className="flex items-center gap-3 p-3 rounded-lg border border-mp-border/50 hover:bg-gray-50 transition-colors">
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
                <p className="text-sm font-body font-medium text-mp-navy">{lang === 'hi' ? hi : en}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
