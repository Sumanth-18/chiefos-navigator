import { useState, useMemo } from "react";
import type { Task, Employee, Leave } from "@/lib/types";
import { computeEmployeeLoad } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, AlertTriangle } from "lucide-react";

interface TaskDetailPanelProps {
  task: Task;
  employees: Employee[];
  allTasks: Task[];
  leaves: Leave[];
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<Task>) => void;
}

export function TaskDetailPanel({ task, employees, allTasks, leaves, onClose, onSave }: TaskDetailPanelProps) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    assignee_id: task.assignee_id || "",
    due_date: task.due_date || "",
    story_points: task.story_points?.toString() || "1",
    estimated_hours: task.estimated_hours?.toString() || "8",
    priority: task.priority,
    status: task.status,
  });

  const currentAssignee = employees.find(e => e.id === task.assignee_id);
  const newAssignee = employees.find(e => e.id === form.assignee_id);

  // Impact analysis for assignee change
  const assigneeImpact = useMemo(() => {
    if (form.assignee_id === task.assignee_id) return null;
    if (!task.assignee_id && !form.assignee_id) return null;

    const impacts: string[] = [];
    if (task.assignee_id) {
      const oldLoad = computeEmployeeLoad(task.assignee_id, allTasks, leaves);
      const newLoadTasks = allTasks.filter(t => !(t.id === task.id && t.assignee_id === task.assignee_id));
      const oldNewLoad = computeEmployeeLoad(task.assignee_id, newLoadTasks, leaves);
      const oldName = currentAssignee?.name || "Previous";
      impacts.push(`${oldName}'s load: ${oldLoad}% → ${oldNewLoad}%`);
    }
    if (form.assignee_id) {
      const currentLoad = computeEmployeeLoad(form.assignee_id, allTasks, leaves);
      const simTasks = [...allTasks.filter(t => t.id !== task.id), { ...task, assignee_id: form.assignee_id }];
      const projectedLoad = computeEmployeeLoad(form.assignee_id, simTasks as Task[], leaves);
      const newName = newAssignee?.name || "New";
      impacts.push(`${newName}'s load: ${currentLoad}% → ${projectedLoad}%${projectedLoad > 85 ? " ⚠" : ""}`);
    }
    return impacts;
  }, [form.assignee_id, task, allTasks, leaves, currentAssignee, newAssignee]);

  // Impact analysis for deadline change
  const deadlineImpact = useMemo(() => {
    if (form.due_date === (task.due_date || "")) return null;
    if (!form.due_date || !task.due_date) return null;
    const oldDate = new Date(task.due_date);
    const newDate = new Date(form.due_date);
    const diffDays = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
    if (diffDays === 0) return null;
    const direction = diffDays > 0 ? "later" : "earlier";
    return `Deadline moved ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? "s" : ""} ${direction}`;
  }, [form.due_date, task.due_date]);

  const hasChanges = form.title !== task.title || form.description !== (task.description || "") ||
    form.assignee_id !== (task.assignee_id || "") || form.due_date !== (task.due_date || "") ||
    form.story_points !== (task.story_points?.toString() || "1") ||
    form.estimated_hours !== (task.estimated_hours?.toString() || "8") ||
    form.priority !== task.priority || form.status !== task.status;

  const handleSave = () => {
    onSave(task.id, {
      title: form.title,
      description: form.description || null,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
      story_points: parseInt(form.story_points) || 1,
      estimated_hours: parseFloat(form.estimated_hours) || 8,
      priority: form.priority as Task["priority"],
      status: form.status as Task["status"],
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-card border-l border-border z-50 overflow-y-auto shadow-2xl">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Task Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-1"><Label>Title</Label>
          <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>

        <div className="space-y-1"><Label>Description</Label>
          <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>

        <div className="space-y-1">
          <Label>Assignee</Label>
          <Select value={form.assignee_id} onValueChange={v => setForm({ ...form, assignee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              {employees.map(emp => {
                const load = computeEmployeeLoad(emp.id, allTasks, leaves);
                return (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px]">{emp.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <span>{emp.name}</span>
                      <Badge variant="outline" className={`text-[9px] ml-auto ${load > 85 ? "text-destructive" : load > 70 ? "text-warning" : "text-success"}`}>{load}%</Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {assigneeImpact && (
            <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs space-y-1">
              <div className="flex items-center gap-1 font-medium text-warning"><AlertTriangle className="h-3 w-3" /> Impact</div>
              {assigneeImpact.map((imp, i) => <p key={i} className="text-muted-foreground">{imp}</p>)}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>Deadline</Label>
          <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          {deadlineImpact && (
            <p className="text-xs text-warning mt-1">{deadlineImpact}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Story Points</Label>
            <Input type="number" value={form.story_points} onChange={e => setForm({ ...form, story_points: e.target.value })} />
          </div>
          <div className="space-y-1"><Label>Est. Hours</Label>
            <Input type="number" value={form.estimated_hours} onChange={e => setForm({ ...form, estimated_hours: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full" disabled={!hasChanges} onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
