import { useState } from "react";
import type { Task, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, GripVertical } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

const COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
  { id: "todo", label: "To Do", dot: "bg-muted-foreground" },
  { id: "in_progress", label: "In Progress", dot: "bg-info" },
  { id: "in_review", label: "In Review", dot: "bg-warning" },
  { id: "done", label: "Done", dot: "bg-success" },
];

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/20 text-info",
  high: "bg-warning/20 text-warning",
  critical: "bg-destructive/20 text-destructive",
};

interface KanbanBoardProps {
  tasks: Task[];
  employees: Employee[];
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus, oldStatus: string) => void;
  onTaskClick: (task: Task) => void;
}

function TaskCard({
  task,
  employee,
  draggedTaskId,
  setDraggedTaskId,
  onClick,
}: {
  task: Task;
  employee?: Employee;
  draggedTaskId: string | null;
  setDraggedTaskId: (id: string | null) => void;
  onClick: () => void;
}) {
  const isDragging = draggedTaskId === task.id;
  return (
    <div
      draggable
      onDragStart={(e) => {
        console.log("[kanban] dragStart", task.id, task.title);
        setDraggedTaskId(task.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      }}
      onDragEnd={() => setDraggedTaskId(null)}
      onClick={onClick}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
      className="rounded-md border border-border/60 bg-card p-3 transition-all hover:border-primary/40 flex gap-2"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge className={`text-[9px] ${priorityColors[task.priority]}`}>{task.priority}</Badge>
          {task.due_date && (
            <span
              className={`flex items-center gap-1 text-[10px] ${
                new Date(task.due_date) < new Date() && task.status !== "done"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              <Calendar className="h-2.5 w-2.5" />
              {new Date(task.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
        {employee && (
          <div className="flex items-center gap-1.5 mt-2">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[8px]">
                {employee.name.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-muted-foreground truncate">{employee.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  column,
  tasks,
  employees,
  draggedTaskId,
  setDraggedTaskId,
  onTaskClick,
  onDropTask,
}: {
  column: typeof COLUMNS[number];
  tasks: Task[];
  employees: Employee[];
  draggedTaskId: string | null;
  setDraggedTaskId: (id: string | null) => void;
  onTaskClick: (task: Task) => void;
  onDropTask: (taskId: string, newStatus: TaskStatus) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`h-2 w-2 rounded-full ${column.dot}`} />
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the column container itself
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const taskId = e.dataTransfer.getData("text/plain");
          console.log("[kanban] drop", taskId, "→", column.id);
          if (!taskId) return;
          onDropTask(taskId, column.id);
        }}
        style={{
          backgroundColor: isDragOver ? "rgba(99,102,241,0.1)" : undefined,
          border: isDragOver ? "2px dashed #6366F1" : "2px dashed transparent",
          borderRadius: "8px",
          minHeight: "400px",
          transition: "all 150ms ease",
        }}
        className="p-2 space-y-2 bg-secondary/30"
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            employee={employees.find((e) => e.id === task.assignee_id)}
            draggedTaskId={draggedTaskId}
            setDraggedTaskId={setDraggedTaskId}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, employees, onTaskStatusChange, onTaskClick }: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDropTask = (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    setDraggedTaskId(null);
    onTaskStatusChange(taskId, newStatus, task.status);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((column) => (
        <Column
          key={column.id}
          column={column}
          tasks={tasks.filter((t) => t.status === column.id)}
          employees={employees}
          draggedTaskId={draggedTaskId}
          setDraggedTaskId={setDraggedTaskId}
          onTaskClick={onTaskClick}
          onDropTask={handleDropTask}
        />
      ))}
    </div>
  );
}
