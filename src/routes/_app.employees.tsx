import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Users, Trash2, Mail, Phone, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Employee } from "@/lib/types";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [form, setForm] = useState({
    name: "", role: "developer", department: "engineering", skills: "",
    email: "", phone: "", current_load: "0", delivery_score: "85",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchEmployees = async () => {
    if (!user) return;
    const { data } = await supabase.from("employees").select("*").order("name");
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, [user]);

  const createEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("employees").insert({
      name: form.name, role: form.role, department: form.department,
      skills: form.skills ? form.skills.split(",").map((s) => s.trim()) : [],
      email: form.email || null, phone: form.phone || null,
      current_load: parseInt(form.current_load), delivery_score: parseFloat(form.delivery_score),
      user_id: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Employee added!");
      setForm({ name: "", role: "developer", department: "engineering", skills: "", email: "", phone: "", current_load: "0", delivery_score: "85" });
      setShowCreate(false);
      fetchEmployees();
    }
  };

  const deleteEmployee = async (id: string) => {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Employee removed"); setSelectedEmployee(null); fetchEmployees(); }
  };

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase()) ||
    e.skills.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const loadColor = (load: number) => {
    if (load >= 90) return "text-destructive";
    if (load >= 70) return "text-warning";
    return "text-success";
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="mt-1 text-muted-foreground">{employees.length} team members</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">No employees found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((emp, i) => (
            <motion.div key={emp.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card
                className="glass-card cursor-pointer transition-all hover:border-primary/30"
                onClick={() => setSelectedEmployee(emp)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{emp.role} · {emp.department}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {emp.skills.slice(0, 4).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    {emp.skills.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">+{emp.skills.length - 4}</Badge>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-muted-foreground">Load: </span>
                      <span className={`font-semibold ${loadColor(emp.current_load)}`}>{emp.current_load}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Score: </span>
                      <span className="font-semibold">{emp.delivery_score}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Projects: </span>
                      <span className="font-semibold">{emp.total_projects}</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
                    <div className={`h-full rounded-full transition-all ${emp.current_load >= 90 ? "bg-destructive" : emp.current_load >= 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${emp.current_load}%` }} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="dark max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Add a new team member</DialogDescription>
          </DialogHeader>
          <form onSubmit={createEmployee} className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
              <div className="space-y-2"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Skills (comma-separated)</Label><Input placeholder="React, Node.js, AWS" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Current Load (%)</Label><Input type="number" min="0" max="100" value={form.current_load} onChange={(e) => setForm({ ...form, current_load: e.target.value })} /></div>
              <div className="space-y-2"><Label>Delivery Score</Label><Input type="number" min="0" max="100" value={form.delivery_score} onChange={(e) => setForm({ ...form, delivery_score: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Add Employee</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="dark max-w-md border-border bg-card">
          {selectedEmployee && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEmployee.name}</DialogTitle>
                <DialogDescription className="capitalize">{selectedEmployee.role} · {selectedEmployee.department}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {selectedEmployee.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{selectedEmployee.email}</p>}
                {selectedEmployee.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{selectedEmployee.phone}</p>}
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/50 p-3">
                  <div className="text-center"><p className="text-lg font-bold">{selectedEmployee.current_load}%</p><p className="text-xs text-muted-foreground">Load</p></div>
                  <div className="text-center"><p className="text-lg font-bold">{selectedEmployee.delivery_score}</p><p className="text-xs text-muted-foreground">Score</p></div>
                  <div className="text-center"><p className="text-lg font-bold">{selectedEmployee.on_time_count}</p><p className="text-xs text-muted-foreground">On-time</p></div>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedEmployee.skills.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="destructive" size="sm" onClick={() => deleteEmployee(selectedEmployee.id)}>
                  <Trash2 className="mr-2 h-3 w-3" />Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
