import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import type { Employee } from "@/lib/types";

export const Route = createFileRoute("/_app/heatmap")({
  component: HeatmapPage,
});

function HeatmapPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("employees").select("*").order("department").then(({ data }) => {
      setEmployees((data as Employee[]) || []);
      setLoading(false);
    });
  }, [user]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const departments = [...new Set(employees.map((e) => e.department))];

  const getHeatColor = (load: number) => {
    if (load >= 90) return "bg-destructive/80";
    if (load >= 70) return "bg-warning/60";
    if (load >= 40) return "bg-info/40";
    return "bg-success/30";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Utilization Heatmap</h1>
        <p className="mt-1 text-muted-foreground">Team workload visualization</p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">Load:</span>
        <div className="flex items-center gap-2">
          {[
            { label: "0-39%", color: "bg-success/30" },
            { label: "40-69%", color: "bg-info/40" },
            { label: "70-89%", color: "bg-warning/60" },
            { label: "90-100%", color: "bg-destructive/80" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <div className={`h-3 w-3 rounded ${l.color}`} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {employees.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-lg font-medium text-muted-foreground">No employees to display</p>
            <p className="text-sm text-muted-foreground/70">Add employees to see the heatmap</p>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="space-y-6">
            {departments.map((dept) => {
              const deptEmployees = employees.filter((e) => e.department === dept);
              return (
                <Card key={dept} className="glass-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base capitalize">{dept}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {deptEmployees.map((emp, i) => (
                        <motion.div
                          key={emp.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`flex flex-col items-center gap-2 rounded-xl p-4 transition-all ${getHeatColor(emp.current_load)} cursor-pointer hover:scale-105`}>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/30 text-sm font-bold">
                                  {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </div>
                                <p className="text-center text-xs font-medium">{emp.name}</p>
                                <p className="text-lg font-bold">{emp.current_load}%</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="dark border-border bg-card">
                              <div className="space-y-1">
                                <p className="font-medium">{emp.name}</p>
                                <p className="text-xs capitalize text-muted-foreground">{emp.role}</p>
                                <p className="text-xs">Load: {emp.current_load}% · Score: {emp.delivery_score}</p>
                                <p className="text-xs">Projects: {emp.total_projects} · On-time: {emp.on_time_count}</p>
                                <p className="text-xs">Skills: {emp.skills.join(", ")}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
