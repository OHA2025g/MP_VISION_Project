# MP Vision 2047 Portal - Local Setup Guide

## Prerequisites
- **Python 3.11+** with pip
- **Node.js 18+** with yarn (`npm install -g yarn`)
- **MongoDB 6+** running locally on port 27017

---

## Quick Start

### 1. Restore MongoDB Database

```bash
# Make sure MongoDB is running, then restore the dump:
mongorestore --uri="mongodb://localhost:27017" --db="test_database" ./mongodb_dump/test_database/
```

This restores: 4 users, 10 sectors, 620 KPIs, 52 districts.

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate    # Linux/Mac
# venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment - edit .env if needed:
# MONGO_URL="mongodb://localhost:27017"
# DB_NAME="test_database"
# JWT_SECRET="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
# ADMIN_EMAIL="admin@mpvision.gov.in"
# ADMIN_PASSWORD="admin123"
# EMERGENT_LLM_KEY=<your-key-here>   (needed for AI insights only)
# FRONTEND_URL="http://localhost:3000"

# Start backend server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend runs at: http://localhost:8001

### 3. Frontend Setup

```bash
cd frontend

# Update .env for local development:
# Change REACT_APP_BACKEND_URL to http://localhost:8001
echo 'REACT_APP_BACKEND_URL=http://localhost:8001' > .env

# Install dependencies
yarn install

# Start development server
yarn start
```

Frontend runs at: http://localhost:3000

---

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@mpvision.gov.in | admin123 |
| **Department Head** | dept@mpvision.gov.in | dept123 |
| **Viewer** | viewer@mpvision.gov.in | viewer123 |

---

## Project Structure

```
mp_vision_2047/
├── backend/
│   ├── server.py              # FastAPI application (all routes)
│   ├── seed_full_kpis.py      # 620 KPI seed from Excel
│   ├── kpi_dictionary.xlsx    # Source KPI dictionary
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Backend config
├── frontend/
│   ├── public/
│   │   └── mp_districts.json  # TopoJSON district boundaries (NIC)
│   ├── src/
│   │   ├── pages/             # All page components
│   │   │   ├── LandingPage.js       # Public landing page
│   │   │   ├── Dashboard.js         # CM Dashboard
│   │   │   ├── SectorDetail.js      # Sectoral Dashboards
│   │   │   ├── KPIExplorer.js       # KPI search & filter
│   │   │   ├── DistrictComparison.js # District comparison
│   │   │   ├── DistrictDetail.js    # District KPI breakdown
│   │   │   ├── DistrictMap.js       # GIS choropleth map
│   │   │   ├── VisionTimeline.js    # 2029/2036/2047 timeline
│   │   │   ├── AdminPanel.js        # Admin CRUD panel
│   │   │   └── LoginPage.js         # Authentication
│   │   ├── components/
│   │   │   ├── custom/              # Layout, Navbar, Sidebar
│   │   │   └── ui/                  # Shadcn UI components
│   │   ├── contexts/                # Auth & Language contexts
│   │   ├── lib/                     # API client, translations
│   │   └── App.js                   # Routes
│   ├── package.json
│   └── tailwind.config.js
├── mongodb_dump/              # Database backup
│   └── test_database/         # 4 users, 10 sectors, 620 KPIs, 52 districts
├── memory/
│   ├── PRD.md                 # Product requirements
│   └── test_credentials.md    # Login credentials
└── README.md                  # This file
```

---

## Key Features

- **Public Landing Page** - Hero, 10 Sectoral Pillars, GIS District Map, News, Stats
- **CM Dashboard** - Executive overview with 620 KPIs, progress tracking, AI insights
- **10 Sectoral Dashboards** - Per-sector deep dive with themes, charts, KPI tables
- **GIS District Map** - Real MP boundaries from NIC, color-coded performance
- **KPI Explorer** - Search, filter, paginate across 620 KPIs
- **District Comparison** - Radar charts, side-by-side tables for up to 4 districts
- **Admin Panel** - CRUD for KPIs, Sectors, Users
- **Department Head Editing** - Sector-scoped KPI value updates
- **PDF & CSV Export** - All dashboards exportable
- **Bilingual** - Full Hindi/English toggle
- **AI Insights** - GPT-5.2 powered policy analysis (requires Emergent LLM key)
- **Mobile Responsive** - Drawer sidebar, adaptive layouts
- **Role-based Auth** - Admin, Department Head, Viewer (JWT + httpOnly cookies)

---

## API Endpoints

### Public (no auth)
- `GET /api/public/stats` - Landing page statistics
- `GET /api/districts` - All 52 districts
- `GET /api/sectors` - All 10 sectors

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Data
- `GET /api/dashboard/overview` - CM Dashboard data
- `GET /api/dashboard/sector-performance` - Sector stats
- `GET /api/sectors/{code}` - Sector detail with KPIs
- `GET /api/kpis?sector=&status=&search=&page=` - KPI search
- `GET /api/districts/{name}` - District detail
- `GET /api/districts/{name}/kpis` - District KPI breakdown

### Admin (admin only)
- `POST/PUT/DELETE /api/admin/kpis/{id}` - KPI CRUD
- `PUT /api/admin/sectors/{code}` - Edit sector
- `GET/PUT/DELETE /api/admin/users/{id}` - User management

### Export
- `GET /api/export/kpis` - CSV export
- `GET /api/export/districts` - CSV export
- `GET /api/export/dashboard/pdf` - CM Dashboard PDF
- `GET /api/export/sector/{code}/pdf` - Sector PDF

---

## Docker Deployment (optional)

```yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo_data:/data/db"]

  backend:
    build: ./backend
    ports: ["8001:8001"]
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=test_database
      - JWT_SECRET=your-secret-key
      - FRONTEND_URL=http://localhost:3000
    depends_on: [mongodb]

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - REACT_APP_BACKEND_URL=http://localhost:8001

volumes:
  mongo_data:
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion |
| Backend | FastAPI, Motor (async MongoDB), PyJWT, bcrypt, fpdf2 |
| Database | MongoDB 6+ |
| GIS | topojson-client, NIC State GIS Portal data |
| AI | OpenAI GPT-5.2 via Emergent Integrations |
| Auth | JWT httpOnly cookies, bcrypt password hashing |
