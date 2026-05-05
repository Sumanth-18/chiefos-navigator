import { Outlet } from '@tanstack/react-router';
import { AppSidebar } from './AppSidebar';
import { Toaster } from '@/components/ui/sonner';

export function AppLayout() {
  return (
    <div className="dark min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
