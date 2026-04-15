# MP Vision 2047 Portal - PRD

## Architecture
- Backend: FastAPI + MongoDB + emergentintegrations (GPT-5.2) + fpdf2
- Frontend: React + Tailwind + Shadcn UI + Recharts + Framer Motion + topojson-client
- Auth: JWT httpOnly cookies, 3 roles (Admin, Department Head, Viewer)
- Routes: / = Public Landing, /login = Auth, /dashboard/* = Protected app

## All Implemented Features
- **Landing Page**: Hero with animated stats, 10 Sectoral Pillars (navy), GIS district map with insights, Vision Schemes & Updates, Strategic Partnerships, Footer
- **CM Dashboard**: 5 metrics, progress bar, status cards, 10 sector pillars grid, top/bottom districts, AI insights
- **10 Sectoral Dashboards**: Theme progress, KPI table with search, trend charts, inline editing, PDF/CSV export
- **620 KPIs** from Excel dictionary, **52 districts** with real NIC GIS boundaries
- **Admin CRUD Panel**: KPIs, Sectors, Users management
- **District KPI Breakdown**, **Department Head editing** (sector-scoped)
- **GIS Choropleth Map**: Zoom/pan, sector filter, hover tooltips, click navigation
- **PDF + CSV Export** for CM Dashboard and all Sectoral Dashboards
- **Mobile Responsive**: Sidebar drawer, hamburger menu, responsive grids
- **Bilingual Hindi/English**, **AI Insights** (GPT-5.2), **Vision Timeline** (2029/2036/2047)

## Backlog
P0: Real-time data APIs, Audit trail | P1: Notifications, Bulk import | P2: Predictive analytics, Public dashboard
