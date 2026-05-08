import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import type { Task, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, GripVertical } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "bg-muted-foreground/20" },
  { id: "in_progress", label: "In Progress", color: "bg-info/20" },
  { id: "in_review", label: "In Review", color: "bg-warning/20" },
  { id: "done", label: "Done", color: "bg-success/20" },
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

function DroppableColumn({
  column,
  tasks,
  employees,
  onTaskClick,
  isOver,
}: {
  column: typeof COLUMNS[number];
  tasks: Task[];
  employees: Employee[];
  onTaskClick: (task: Task) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`h-2 w-2 rounded-full ${column.color}`} />
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[300px] rounded-lg border border-border/50 p-2 space-y-2 transition-colors ${
          isOver ? "bg-primary/10 border-primary/50" : "bg-secondary/30"
        }`}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              employee={employees.find(e => e.id === task.assignee_id)}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  employee,
  onClick,
}: {
  task: Task;
  employee?: Employee;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    rotate: isDragging ? "2deg" : "0deg",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border/60 bg-card p-3 cursor-pointer hover:border-primary/30 transition-all group"
      onClick={onClick}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        <div {...listeners} className="mt-1 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={`text-[9px] ${priorityColors[task.priority]}`}>{task.priority}</Badge>
            {task.due_date && (
              <span className={`flex items-center gap-1 text-[10px] ${
                new Date(task.due_date) < new Date() && task.status !== "done" ? "text-destructive" : "text-muted-foreground"
              }`}>
                <Calendar className="h-2.5 w-2.5" />
                {new Date(task.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          {employee && (
            <div className="flex items-center gap-1.5 mt-2">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[8px]">{employee.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground truncate">{employee.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCardOverlay({ task, employee }: { task: Task; employee?: Employee }) {
  return (
    <div className="rounded-md border border-primary/40 bg-card p-3 shadow-lg rotate-2 opacity-90 w-[240px]">
      <p className="text-sm font-medium truncate">{task.title}</p>
      <div className="flex items-center gap-2 mt-2">
        <Badge className={`text-[9px] ${priorityColors[task.priority]}`}>{task.priority}</Badge>
      </div>
      {employee && (
        <div className="flex items-center gap-1.5 mt-2">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[8px]">{employee.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
          </Avatar>
          <span className="text-[10px] text-muted-foreground">{employee.name}</span>
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({ tasks, employees, onTaskStatusChange, onTaskClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id;
    if (!overId) { setOverColumn(null); return; }
    // Check if over a column directly
    const colIds = COLUMNS.map(c => c.id);
    if (colIds.includes(overId as TaskStatus)) {
      setOverColumn(overId as string);
    } else {
      // Over a task — find which column that task is in
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) setOverColumn(overTask.status);
    }
  }, [tasks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);
    if (!over) return;

    const task = tasks.find(t => t.id === active.id);
    if (!task) return;

    let newStatus: TaskStatus;
    const colIds = COLUMNS.map(c => c.id);
    if (colIds.includes(over.id as TaskStatus)) {
      newStatus = over.id as TaskStatus;
    } else {
      const overTask = tasks.find(t => t.id === over.id);
      if (!overTask) return;
      newStatus = overTask.status as TaskStatus;
    }

    if (newStatus !== task.status) {
      onTaskStatusChange(task.id, newStatus, task.status);
    }
  }, [tasks, onTaskStatusChange]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(column => (
          <DroppableColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.id]}
            employees={employees}
            onTaskClick={onTaskClick}
            isOver={overColumn === column.id}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCardOverlay
            task={activeTask}
            employee={employees.find(e => e.id === activeTask.assignee_id)}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
