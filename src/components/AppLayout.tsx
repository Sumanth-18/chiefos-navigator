import { useEffect, useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { AppSidebar } from './AppSidebar';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { seedDemoData } from '@/server/seed.functions';
import { toast } from 'sonner';

export function AppLayout() {
  const { user } = useAuth();
  const seeded = useRef(false);

  useEffect(() => {
    if (!user || seeded.current) return;
    seeded.current = true;

    if (typeof window !== 'undefined' && !sessionStorage.getItem('demo_seeded')) {
      seedDemoData().then((res) => {
        if (res.seeded) {
          toast.success('Demo data loaded');
        }
        sessionStorage.setItem('demo_seeded', '1');
      }).catch((err) => {
        console.error('Seed error:', err);
      });
    }
  }, [user]);

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
