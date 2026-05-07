import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Delete all existing data for this user (order matters for FK)
    await supabase.from("audit_log").delete().eq("user_id", userId);
    await supabase.from("tasks").delete().eq("user_id", userId);
    await supabase.from("project_members").delete().in(
      "project_id",
      (await supabase.from("projects").select("id").eq("user_id", userId)).data?.map((p) => p.id) ?? []
    );
    await supabase.from("leaves").delete().eq("user_id", userId);
    await supabase.from("projects").delete().eq("user_id", userId);
    await supabase.from("employees").delete().eq("user_id", userId);

    // Insert employees
    const employeesData = [
      { name: "Sumanth Reddy", role: "super_admin", department: "leadership", skills: ["Strategy", "Business Analysis", "Project Management"], delivery_score: 98, on_time_count: 23 },
      { name: "Priya Sharma", role: "manager", department: "engineering", skills: ["React", "Node.js", "TypeScript", "System Design"], delivery_score: 94, on_time_count: 17 },
      { name: "Ravi Kumar", role: "developer", department: "engineering", skills: ["Node.js", "Python", "PostgreSQL", "DevOps"], delivery_score: 89, on_time_count: 18 },
      { name: "Arjun Mehta", role: "developer", department: "engineering", skills: ["React", "Node.js", "MongoDB", "AWS"], delivery_score: 91, on_time_count: 13 },
      { name: "Sneha Patel", role: "manager", department: "qa", skills: ["Test Automation", "Selenium", "API Testing", "QA"], delivery_score: 96, on_time_count: 19 },
      { name: "Vikram Singh", role: "developer", department: "devops", skills: ["DevOps", "AWS", "Docker", "Kubernetes", "CI/CD"], delivery_score: 87, on_time_count: 10 },
      { name: "Neha Joshi", role: "developer", department: "design", skills: ["Figma", "UI Design", "UX Research", "Design Systems"], delivery_score: 97, on_time_count: 15 },
      { name: "Aditya Rao", role: "developer", department: "mobile", skills: ["React Native", "Flutter", "iOS", "Android"], delivery_score: 93, on_time_count: 13 },
    ];

    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .insert(employeesData.map((e) => ({ ...e, user_id: userId })))
      .select();

    if (empErr || !employees) {
      throw new Error("Failed to insert employees: " + empErr?.message);
    }

    const emp = (name: string) => employees.find((e) => e.name === name)!;

    // Insert leaves
    await supabase.from("leaves").insert([
      { employee_id: emp("Priya Sharma").id, start_date: "2026-06-15", end_date: "2026-06-19", leave_type: "vacation", status: "approved", user_id: userId },
      { employee_id: emp("Neha Joshi").id, start_date: "2026-05-20", end_date: "2026-05-22", leave_type: "personal", status: "approved", user_id: userId },
      { employee_id: emp("Vikram Singh").id, start_date: "2026-05-10", end_date: "2026-05-10", leave_type: "sick", status: "approved", user_id: userId },
    ]);

    // Insert projects
    const projectsData = [
      { name: "FinTrack Pro", client_name: "Axis Capital Group", brief: "Financial tracking dashboard with real-time portfolio analytics", required_skills: ["React", "Node.js", "PostgreSQL", "AWS"], deadline: "2026-06-30", status: "active", priority: "high", budget: 1200000 },
      { name: "DeployShield", client_name: "CloudMatrix Solutions", brief: "Automated security scanning and CI/CD deployment pipeline", required_skills: ["DevOps", "AWS", "Docker", "Python"], deadline: "2026-05-28", status: "active", priority: "critical", budget: 500000 },
      { name: "HireFlow Platform", client_name: "TalentBridge HR", brief: "AI-powered recruitment workflow with resume parsing", required_skills: ["Python", "React", "API Testing"], deadline: "2026-08-15", status: "planning", priority: "medium", budget: 850000 },
      { name: "MobiShop v2", client_name: "RetailKart India", brief: "E-commerce mobile app with UPI payment integration", required_skills: ["React Native", "UI Design", "QA"], deadline: "2026-04-30", status: "completed", priority: "high", budget: 725000 },
    ];

    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .insert(projectsData.map((p) => ({ ...p, user_id: userId })))
      .select();

    if (projErr || !projects) {
      throw new Error("Failed to insert projects: " + projErr?.message);
    }

    const proj = (name: string) => projects.find((p) => p.name === name)!;

    // Insert project_members
    await supabase.from("project_members").insert([
      // FinTrack Pro
      { project_id: proj("FinTrack Pro").id, employee_id: emp("Priya Sharma").id, role: "manager", match_score: 92 },
      { project_id: proj("FinTrack Pro").id, employee_id: emp("Ravi Kumar").id, role: "member", match_score: 88 },
      { project_id: proj("FinTrack Pro").id, employee_id: emp("Arjun Mehta").id, role: "member", match_score: 85 },
      { project_id: proj("FinTrack Pro").id, employee_id: emp("Sneha Patel").id, role: "member", match_score: 70 },
      // DeployShield
      { project_id: proj("DeployShield").id, employee_id: emp("Sneha Patel").id, role: "manager", match_score: 75 },
      { project_id: proj("DeployShield").id, employee_id: emp("Vikram Singh").id, role: "member", match_score: 95 },
      { project_id: proj("DeployShield").id, employee_id: emp("Ravi Kumar").id, role: "member", match_score: 80 },
      // HireFlow Platform
      { project_id: proj("HireFlow Platform").id, employee_id: emp("Priya Sharma").id, role: "manager", match_score: 85 },
      { project_id: proj("HireFlow Platform").id, employee_id: emp("Arjun Mehta").id, role: "member", match_score: 82 },
      { project_id: proj("HireFlow Platform").id, employee_id: emp("Sneha Patel").id, role: "member", match_score: 78 },
      { project_id: proj("HireFlow Platform").id, employee_id: emp("Neha Joshi").id, role: "member", match_score: 72 },
      // MobiShop v2
      { project_id: proj("MobiShop v2").id, employee_id: emp("Priya Sharma").id, role: "manager", match_score: 80 },
      { project_id: proj("MobiShop v2").id, employee_id: emp("Aditya Rao").id, role: "member", match_score: 95 },
      { project_id: proj("MobiShop v2").id, employee_id: emp("Neha Joshi").id, role: "member", match_score: 88 },
      { project_id: proj("MobiShop v2").id, employee_id: emp("Sneha Patel").id, role: "member", match_score: 75 },
    ]);

    // Insert tasks - FinTrack Pro
    const fintrackId = proj("FinTrack Pro").id;
    const deployshieldId = proj("DeployShield").id;
    const hireflowId = proj("HireFlow Platform").id;
    const mobishopId = proj("MobiShop v2").id;

    await supabase.from("tasks").insert([
      // FinTrack Pro (8)
      { title: "Setup project architecture", assignee_id: emp("Ravi Kumar").id, project_id: fintrackId, status: "done", story_points: 5, estimated_hours: 20, due_date: "2026-05-15", priority: "high", user_id: userId },
      { title: "Design database schema", assignee_id: emp("Ravi Kumar").id, project_id: fintrackId, status: "done", story_points: 3, estimated_hours: 12, due_date: "2026-05-20", priority: "high", user_id: userId },
      { title: "Build authentication API", assignee_id: emp("Arjun Mehta").id, project_id: fintrackId, status: "in_progress", story_points: 5, estimated_hours: 20, due_date: "2026-06-05", priority: "high", user_id: userId },
      { title: "Create dashboard UI components", assignee_id: emp("Priya Sharma").id, project_id: fintrackId, status: "in_progress", story_points: 8, estimated_hours: 32, due_date: "2026-06-10", priority: "medium", user_id: userId },
      { title: "Portfolio analytics API", assignee_id: emp("Ravi Kumar").id, project_id: fintrackId, status: "todo", story_points: 8, estimated_hours: 32, due_date: "2026-06-15", priority: "high", user_id: userId },
      { title: "QA test suite setup", assignee_id: emp("Sneha Patel").id, project_id: fintrackId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-06-18", priority: "medium", user_id: userId },
      { title: "AWS deployment setup", assignee_id: emp("Arjun Mehta").id, project_id: fintrackId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-06-22", priority: "medium", user_id: userId },
      { title: "UAT and client review", assignee_id: emp("Priya Sharma").id, project_id: fintrackId, status: "todo", story_points: 3, estimated_hours: 12, due_date: "2026-06-28", priority: "low", user_id: userId },
      // DeployShield (10)
      { title: "Security audit planning", assignee_id: emp("Vikram Singh").id, project_id: deployshieldId, status: "done", story_points: 3, estimated_hours: 12, due_date: "2026-05-01", priority: "high", user_id: userId },
      { title: "Docker containerization", assignee_id: emp("Vikram Singh").id, project_id: deployshieldId, status: "in_progress", story_points: 8, estimated_hours: 32, due_date: "2026-05-05", priority: "critical", user_id: userId },
      { title: "CI/CD pipeline setup", assignee_id: emp("Ravi Kumar").id, project_id: deployshieldId, status: "in_progress", story_points: 8, estimated_hours: 32, due_date: "2026-05-08", priority: "critical", user_id: userId },
      { title: "AWS security groups config", assignee_id: emp("Vikram Singh").id, project_id: deployshieldId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-05-15", priority: "high", user_id: userId },
      { title: "Vulnerability scanning integration", assignee_id: emp("Ravi Kumar").id, project_id: deployshieldId, status: "todo", story_points: 8, estimated_hours: 32, due_date: "2026-05-18", priority: "high", user_id: userId },
      { title: "Penetration testing", assignee_id: emp("Sneha Patel").id, project_id: deployshieldId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-05-20", priority: "high", user_id: userId },
      { title: "Load testing", assignee_id: emp("Vikram Singh").id, project_id: deployshieldId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-05-22", priority: "medium", user_id: userId },
      { title: "Documentation", assignee_id: emp("Ravi Kumar").id, project_id: deployshieldId, status: "todo", story_points: 3, estimated_hours: 12, due_date: "2026-05-24", priority: "low", user_id: userId },
      { title: "Client UAT", assignee_id: emp("Sneha Patel").id, project_id: deployshieldId, status: "todo", story_points: 3, estimated_hours: 12, due_date: "2026-05-26", priority: "medium", user_id: userId },
      { title: "Final deployment", assignee_id: emp("Vikram Singh").id, project_id: deployshieldId, status: "todo", story_points: 8, estimated_hours: 32, due_date: "2026-05-28", priority: "critical", user_id: userId },
      // HireFlow (6)
      { title: "Resume parsing engine", assignee_id: emp("Arjun Mehta").id, project_id: hireflowId, status: "todo", story_points: 8, estimated_hours: 32, due_date: "2026-07-15", priority: "high", user_id: userId },
      { title: "Candidate scoring algorithm", assignee_id: emp("Arjun Mehta").id, project_id: hireflowId, status: "todo", story_points: 8, estimated_hours: 32, due_date: "2026-07-22", priority: "high", user_id: userId },
      { title: "Job posting UI", assignee_id: emp("Neha Joshi").id, project_id: hireflowId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-07-10", priority: "medium", user_id: userId },
      { title: "API integration layer", assignee_id: emp("Arjun Mehta").id, project_id: hireflowId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-07-28", priority: "medium", user_id: userId },
      { title: "QA test plan", assignee_id: emp("Sneha Patel").id, project_id: hireflowId, status: "todo", story_points: 3, estimated_hours: 12, due_date: "2026-08-01", priority: "medium", user_id: userId },
      { title: "UI/UX design system", assignee_id: emp("Neha Joshi").id, project_id: hireflowId, status: "todo", story_points: 5, estimated_hours: 20, due_date: "2026-07-05", priority: "medium", user_id: userId },
      // MobiShop v2 (4)
      { title: "App architecture setup", assignee_id: emp("Aditya Rao").id, project_id: mobishopId, status: "done", story_points: 5, estimated_hours: 20, priority: "high", user_id: userId },
      { title: "UPI payment integration", assignee_id: emp("Aditya Rao").id, project_id: mobishopId, status: "done", story_points: 8, estimated_hours: 32, priority: "critical", user_id: userId },
      { title: "UI design implementation", assignee_id: emp("Neha Joshi").id, project_id: mobishopId, status: "done", story_points: 5, estimated_hours: 20, priority: "medium", user_id: userId },
      { title: "Full QA testing", assignee_id: emp("Sneha Patel").id, project_id: mobishopId, status: "done", story_points: 5, estimated_hours: 20, priority: "high", user_id: userId },
    ]);

    // Insert audit_log
    await supabase.from("audit_log").insert([
      { action: "project_created", entity_type: "project", entity_id: deployshieldId, details: { name: "DeployShield", client: "CloudMatrix" }, user_id: userId },
      { action: "task_assigned", entity_type: "task", details: { title: "CI/CD pipeline setup", assignee: "Ravi Kumar" }, user_id: userId },
      { action: "task_completed", entity_type: "task", details: { title: "Design database schema", completed_by: "Ravi Kumar" }, user_id: userId },
      { action: "leave_applied", entity_type: "leave", details: { employee: "Priya Sharma", from: "2026-06-15", to: "2026-06-19" }, user_id: userId },
      { action: "task_overdue", entity_type: "task", details: { title: "Docker containerization", assignee: "Vikram Singh", overdue_days: 1 }, user_id: userId },
      { action: "project_created", entity_type: "project", entity_id: hireflowId, details: { name: "HireFlow Platform", client: "TalentBridge HR" }, user_id: userId },
      { action: "task_assigned", entity_type: "task", details: { title: "Resume parsing engine", assignee: "Arjun Mehta" }, user_id: userId },
      { action: "project_completed", entity_type: "project", entity_id: mobishopId, details: { name: "MobiShop v2", client: "RetailKart India" }, user_id: userId },
      { action: "task_overdue", entity_type: "task", details: { title: "Docker containerization", overdue_days: 2 }, user_id: userId },
      { action: "leave_applied", entity_type: "leave", details: { employee: "Neha Joshi", from: "2026-05-20", to: "2026-05-22" }, user_id: userId },
    ]);

    return { seeded: true };
  });
