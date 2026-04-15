import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import api from "@/lib/api";
import { statusColors } from "@/lib/translations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings, Plus, Pencil, Trash2, Users, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDecimal } from "@/lib/utils";

const SECTORS = [
  { code: "AGR", label: "Agriculture" }, { code: "ECO", label: "Economy" },
  { code: "EDU", label: "Education" }, { code: "ENV", label: "Environment" },
  { code: "GOV", label: "Governance" }, { code: "IND", label: "Industry" },
  { code: "INF", label: "Infrastructure" }, { code: "HLT", label: "Health" },
  { code: "SOC", label: "Social" }, { code: "PMU", label: "PMU" },
];

function KPIManagement() {
  const [kpis, setKpis] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [loading, setLoading] = useState(true);
  const [editKpi, setEditKpi] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({});

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.append("search", search);
    if (sector) params.append("sector", sector);
    const { data } = await api.get(`/kpis?${params}`);
    setKpis(data.data); setTotal(data.total); setPages(data.pages);
    setLoading(false);
  }, [page, search, sector]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  useEffect(() => { setPage(1); }, [search, sector]);

  const handleSaveEdit = async () => {
    try {
      await api.put(`/admin/kpis/${editKpi.kpi_id}`, form);
      toast.success("KPI updated"); setEditKpi(null); fetchKpis();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to update"); }
  };

  const handleCreate = async () => {
    try {
      await api.post("/admin/kpis", form);
      toast.success("KPI created"); setShowCreate(false); setForm({}); fetchKpis();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create"); }
  };

  const handleDelete = async (kpiId) => {
    if (!window.confirm(`Delete ${kpiId}?`)) return;
    try {
      await api.delete(`/admin/kpis/${kpiId}`);
      toast.success("KPI deleted"); fetchKpis();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to delete"); }
  };

  const exportCSV = () => {
    const params = sector ? `?sector=${sector}` : "";
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/kpis${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="kpi-management">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search KPIs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 font-body" data-testid="admin-kpi-search" />
        </div>
        <Select value={sector} onValueChange={v => setSector(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px] font-body" data-testid="admin-kpi-sector-filter"><SelectValue placeholder="All Sectors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {SECTORS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={exportCSV} variant="outline" className="font-body" data-testid="export-kpi-csv-btn"><Download className="w-4 h-4 mr-1" /> CSV</Button>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-mp-primary text-white font-body" data-testid="create-kpi-btn"><Plus className="w-4 h-4 mr-1" /> Add KPI</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-heading">Create New KPI</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {[
                { key: "kpi_id", label: "KPI ID", placeholder: "e.g. AGR-081" },
                { key: "kpi_name", label: "Name", placeholder: "KPI Name" },
                { key: "theme", label: "Theme", placeholder: "Theme" },
                { key: "formula", label: "Formula", placeholder: "Formula" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}><Label className="font-body text-xs">{label}</Label>
                  <Input className="font-body mt-1" placeholder={placeholder} value={form[key] || ""} onChange={e => setForm(p => ({...p, [key]: e.target.value}))} data-testid={`create-kpi-${key}`} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="font-body text-xs">Sector</Label>
                  <Select value={form.sector_code || ""} onValueChange={v => setForm(p => ({...p, sector_code: v}))}>
                    <SelectTrigger className="mt-1 font-body"><SelectValue placeholder="Sector" /></SelectTrigger>
                    <SelectContent>{SECTORS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="font-body text-xs">Unit</Label>
                  <Input className="font-body mt-1" placeholder="%" value={form.unit || ""} onChange={e => setForm(p => ({...p, unit: e.target.value}))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["baseline_2024", "current_value", "target_2029", "target_2036", "target_2047"].map(k => (
                  <div key={k}><Label className="font-body text-xs">{k.replace("_", " ")}</Label>
                    <Input type="number" className="font-body mt-1" value={form[k] || ""} onChange={e => setForm(p => ({...p, [k]: parseFloat(e.target.value) || 0}))} />
                  </div>
                ))}
              </div>
              <Button onClick={handleCreate} className="w-full bg-mp-primary text-white font-body" data-testid="save-create-kpi-btn">Create KPI</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-gray-400 font-body">{total} KPIs total</p>

      <div className="overflow-auto border rounded-lg border-mp-border">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-mp-border">
            <tr>
              {["ID", "Name", "Sector", "Unit", "Baseline", "Current", "T-2029", "Status", "Actions"].map(h => (
                <th key={h} className="text-left p-2.5 font-body font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpis.map(kpi => {
              const sc = statusColors[kpi.status];
              return (
                <tr key={kpi.kpi_id} className="border-b border-mp-border/50 hover:bg-gray-50" data-testid={`admin-kpi-row-${kpi.kpi_id}`}>
                  <td className="p-2.5 font-body font-medium text-mp-primary">{kpi.kpi_id}</td>
                  <td className="p-2.5 font-body text-mp-navy max-w-[200px] truncate">{kpi.kpi_name}</td>
                  <td className="p-2.5 font-body text-gray-500">{kpi.sector_code}</td>
                  <td className="p-2.5 font-body text-gray-500">{kpi.unit}</td>
                  <td className="p-2.5 font-body">{formatDecimal(kpi.baseline_2024)}</td>
                  <td className="p-2.5 font-body font-medium">{formatDecimal(kpi.current_value)}</td>
                  <td className="p-2.5 font-body">{formatDecimal(kpi.target_2029)}</td>
                  <td className="p-2.5"><Badge variant="outline" className={`text-[9px] ${sc?.text} ${sc?.border} ${sc?.bg}`}>{kpi.status.replace("_", " ")}</Badge></td>
                  <td className="p-2.5">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditKpi(kpi); setForm({ current_value: kpi.current_value, target_2029: kpi.target_2029, target_2036: kpi.target_2036, target_2047: kpi.target_2047, kpi_name: kpi.kpi_name }); }} data-testid={`edit-kpi-${kpi.kpi_id}`}>
                        <Pencil className="w-3.5 h-3.5 text-mp-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(kpi.kpi_id)} data-testid={`delete-kpi-${kpi.kpi_id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-body text-gray-500">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}

      <Dialog open={!!editKpi} onOpenChange={() => setEditKpi(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Edit {editKpi?.kpi_id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="font-body text-xs">Name</Label>
              <Input className="font-body mt-1" value={form.kpi_name || ""} onChange={e => setForm(p => ({...p, kpi_name: e.target.value}))} />
            </div>
            {["current_value", "target_2029", "target_2036", "target_2047"].map(k => (
              <div key={k}><Label className="font-body text-xs">{k.replace("_", " ")}</Label>
                <Input type="number" className="font-body mt-1" value={form[k] ?? ""} onChange={e => setForm(p => ({...p, [k]: parseFloat(e.target.value) || 0}))} />
              </div>
            ))}
            <Button onClick={handleSaveEdit} className="w-full bg-mp-primary text-white font-body" data-testid="save-edit-kpi-btn">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/users").then(r => setUsers(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const updateRole = async (userId, role, sector) => {
    try {
      await api.put(`/admin/users/${userId}`, { role, assigned_sector: sector || undefined });
      toast.success("User updated");
      const { data } = await api.get("/admin/users");
      setUsers(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      toast.success("User deleted");
      setUsers(users.filter(u => u._id !== userId));
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (loading) return <p className="font-body text-gray-400">Loading...</p>;

  return (
    <div className="space-y-4" data-testid="user-management">
      <div className="overflow-auto border rounded-lg border-mp-border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-mp-border">
            <tr>{["Name", "Email", "Role", "Assigned Sector", "Actions"].map(h => <th key={h} className="text-left p-3 font-body font-medium text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id} className="border-b border-mp-border/50 hover:bg-gray-50" data-testid={`user-row-${u._id}`}>
                <td className="p-3 font-body font-medium text-mp-navy">{u.name}</td>
                <td className="p-3 font-body text-gray-500">{u.email}</td>
                <td className="p-3">
                  <Select value={u.role} onValueChange={v => updateRole(u._id, v, u.assigned_sector)}>
                    <SelectTrigger className="w-[160px] font-body text-xs h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="department_head">Department Head</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">
                  {u.role === "department_head" && (
                    <Select value={u.assigned_sector || ""} onValueChange={v => updateRole(u._id, u.role, v)}>
                      <SelectTrigger className="w-[140px] font-body text-xs h-8"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>{SECTORS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteUser(u._id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectorManagement() {
  const [sectors, setSectors] = useState([]);
  const [editSector, setEditSector] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    api.get("/sectors").then(r => setSectors(r.data)).catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      await api.put(`/admin/sectors/${editSector.code}`, form);
      toast.success("Sector updated"); setEditSector(null);
      const { data } = await api.get("/sectors");
      setSectors(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const exportCSV = () => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/districts`, "_blank");

  return (
    <div className="space-y-4" data-testid="sector-management">
      <div className="flex justify-end">
        <Button size="sm" onClick={exportCSV} variant="outline" className="font-body"><Download className="w-4 h-4 mr-1" /> Export Districts CSV</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sectors.map(s => (
          <Card key={s.code} className="border-mp-border shadow-sm" data-testid={`admin-sector-${s.code}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-bold" style={{ backgroundColor: s.color }}>{s.code}</div>
                  <div>
                    <p className="font-body font-medium text-sm text-mp-navy">{s.name}</p>
                    <p className="text-[10px] text-gray-400 font-body">{s.kpi_count} KPIs | Score: {formatDecimal(s.overall_score)}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditSector(s); setForm({ name: s.name, description: s.description, color: s.color }); }}>
                  <Pencil className="w-3.5 h-3.5 text-mp-primary" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 font-body">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={!!editSector} onOpenChange={() => setEditSector(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Edit {editSector?.code}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[{k: "name", l: "Name"}, {k: "description", l: "Description"}, {k: "color", l: "Color"}].map(({k, l}) => (
              <div key={k}><Label className="font-body text-xs">{l}</Label>
                <Input className="font-body mt-1" value={form[k] || ""} onChange={e => setForm(p => ({...p, [k]: e.target.value}))} />
              </div>
            ))}
            <Button onClick={handleSave} className="w-full bg-mp-primary text-white font-body">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const { t } = useLanguage();

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64" data-testid="admin-access-denied">
        <Card className="border-mp-border"><CardContent className="p-8 text-center">
          <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-body text-gray-500">Admin access required</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-panel-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-mp-navy" data-testid="admin-title">Admin Panel</h1>
        <p className="text-sm text-gray-500 font-body mt-1">Manage KPIs, Sectors, and Users</p>
      </div>
      <Tabs defaultValue="kpis">
        <TabsList className="border-mp-border" data-testid="admin-tabs">
          <TabsTrigger value="kpis" className="font-body">KPIs (620)</TabsTrigger>
          <TabsTrigger value="sectors" className="font-body">Sectors</TabsTrigger>
          <TabsTrigger value="users" className="font-body"><Users className="w-3.5 h-3.5 mr-1" />Users</TabsTrigger>
        </TabsList>
        <TabsContent value="kpis"><KPIManagement /></TabsContent>
        <TabsContent value="sectors"><SectorManagement /></TabsContent>
        <TabsContent value="users"><UserManagement /></TabsContent>
      </Tabs>
    </div>
  );
}
