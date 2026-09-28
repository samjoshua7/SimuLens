'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center space-y-3 select-none"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      <span className="text-xs text-slate-400 font-mono">Initializing SimuLens...</span>
    </div>
  );
}
