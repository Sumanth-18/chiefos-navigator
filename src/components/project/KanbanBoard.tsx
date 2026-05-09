import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar } from "lucide-react";

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
  onClick,
  dragging,
}: {
  task: Task;
  employee?: Employee;
  onClick?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-md border border-border/60 bg-card p-3 transition-all hover:border-primary/40 ${
        dragging ? "shadow-2xl rotate-2 border-primary/60" : ""
      }`}
    >
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
  );
}

function DraggableTaskCard({
  task,
  employee,
  onClick,
}: {
  task: Task;
  employee?: Employee;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
  };

  // Click vs drag: only trigger click if no movement
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    onClick();
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={handleClick}>
      <TaskCard task={task} employee={employee} />
    </div>
  );
}

function DroppableColumn({
  column,
  tasks,
  employees,
  onTaskClick,
}: {
  column: typeof COLUMNS[number];
  tasks: Task[];
  employees: Employee[];
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`h-2 w-2 rounded-full ${column.dot}`} />
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[400px] rounded-lg border-2 p-2 space-y-2 transition-colors ${
          isOver ? "border-primary bg-primary/10" : "border-border/40 bg-secondary/30"
        }`}
      >
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            employee={employees.find((e) => e.id === task.assignee_id)}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, employees, onTaskStatusChange, onTaskClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const task = tasks.find((t) => t.id === active.id);
      const newStatus = over.id as TaskStatus;
      if (!task || !COLUMNS.some((c) => c.id === newStatus)) return;
      if (task.status === newStatus) return;

      onTaskStatusChange(task.id, newStatus, task.status);
    },
    [tasks, onTaskStatusChange],
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
          <DroppableColumn
            key={column.id}
            column={column}
            tasks={tasks.filter((t) => t.status === column.id)}
            employees={employees}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-[240px]">
            <TaskCard
              task={activeTask}
              employee={employees.find((e) => e.id === activeTask.assignee_id)}
              dragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
