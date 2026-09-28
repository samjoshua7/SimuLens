'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  MapPin,
  Plus,
  ArrowRight,
  ArrowLeft,
  Cpu,
  Loader2,
  X,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

interface Branch {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  canvas_w: number;
  canvas_h: number;
  created_at: string;
  machine_count?: number;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
}

export default function OrgBranchesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const [org, setOrg] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch org by slug
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !orgData) {
      router.replace('/dashboard');
      return;
    }
    setOrg(orgData);

    // Fetch branches
    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .eq('org_id', orgData.id)
      .order('created_at', { ascending: false });

    const enriched = await Promise.all(
      (branchData || []).map(async (branch: Branch) => {
        const { count } = await supabase
          .from('branch_machines')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branch.id);
        return { ...branch, machine_count: count || 0 };
      })
    );

    setBranches(enriched);
    setLoading(false);
  }, [user, orgSlug, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !org || !newBranchName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const { error: branchError } = await supabase
        .from('branches')
        .insert({
          org_id: org.id,
          name: newBranchName.trim(),
          address: newBranchAddress.trim() || null,
        });

      if (branchError) throw branchError;

      setShowCreateModal(false);
      setNewBranchName('');
      setNewBranchAddress('');
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create branch';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-6">
        <Link href="/dashboard" className="transition-colors duration-150"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          Organizations
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span style={{ color: 'var(--text-primary)' }} className="font-medium">
          {org?.name}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Branches
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage locations and floor plans for {org?.name}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-text)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
        >
          <Plus className="w-4 h-4" />
          New Branch
        </button>
      </div>

      {/* Empty State */}
      {branches.length === 0 && (
        <div className="text-center py-20">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <MapPin className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <h3 className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            No branches yet
          </h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Create your first branch to set up a floor plan and place machinery
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-text)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
          >
            <Plus className="w-4 h-4" />
            Create Branch
          </button>
        </div>
      )}

      {/* Branch Grid */}
      {branches.length > 0 && (
        <div className="grid gap-3">
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => router.push(`/dashboard/${orgSlug}/${branch.id}`)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-150 group"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                <MapPin className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {branch.name}
                </h3>
                <div className="flex items-center gap-3 mt-0.5">
                  {branch.address && (
                    <span className="text-xs truncate max-w-[200px]"
                          style={{ color: 'var(--text-tertiary)' }}>
                      {branch.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--text-tertiary)' }}>
                    <Cpu className="w-3 h-3" />
                    {branch.machine_count} machine{branch.machine_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight
                className="w-4 h-4 shrink-0 transition-transform duration-150 group-hover:translate-x-1"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowCreateModal(false)}
          />
          <div
            className="relative w-full max-w-md rounded-xl border p-6 animate-slide-up"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              boxShadow: '0 8px 32px var(--shadow-color)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Create Branch
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-primary)' }}>
                  Branch Name
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. HQ Factory Floor"
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg border text-sm transition-colors duration-150"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-primary)' }}>
                  Address <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  placeholder="e.g. 123 Industrial Ave, Building C"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm transition-colors duration-150"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg text-sm"
                     style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newBranchName.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-text)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
