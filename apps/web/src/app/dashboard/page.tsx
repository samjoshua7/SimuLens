'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  Building2,
  Plus,
  ArrowRight,
  Users,
  GitBranch,
  Loader2,
  X,
} from 'lucide-react';

import { orgStore } from '@/lib/branchStore';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  owner_id: string;
  created_at: string;
  member_count?: number;
  branch_count?: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>(() => (orgStore.get() as Organization[]) || []);
  const [loading, setLoading] = useState(() => !orgStore.has());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    if (!user) return;
    if (!orgStore.has()) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch orgs:', error.message);
        if (!orgStore.has()) setOrgs([]);
      } else {
        // Fetch counts for each org
        const enriched = await Promise.all(
          (data || []).map(async (org: Organization) => {
            const [members, branches] = await Promise.all([
              supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
              supabase.from('branches').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
            ]);
            return {
              ...org,
              member_count: members.count || 0,
              branch_count: branches.count || 0,
            };
          })
        );
        setOrgs(enriched);
        orgStore.set(enriched);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const slugify = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newOrgName.trim()) return;
    setCreating(true);
    setError(null);

    const slug = slugify(newOrgName);

    try {
      // Create the organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          slug,
          owner_id: user.id,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Ensure owner membership (also handled by DB trigger)
      await supabase
        .from('org_members')
        .upsert({
          org_id: org.id,
          user_id: user.id,
          role: 'owner',
        }, { onConflict: 'org_id,user_id' });

      setShowCreateModal(false);
      setNewOrgName('');
      await fetchOrgs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create organization';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Organizations
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Select an organization to manage branches and machines
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
          New Organization
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      )}

      {/* Empty State */}
      {!loading && orgs.length === 0 && (
        <div className="text-center py-20 animate-fade-in">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <Building2 className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <h3 className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            No organizations yet
          </h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Create your first organization to start managing branches and machinery
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
            Create Organization
          </button>
        </div>
      )}

      {/* Org Grid */}
      {!loading && orgs.length > 0 && (
        <div className="grid gap-3 animate-fade-in">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => router.push(`/dashboard/${org.slug}`)}
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
                <Building2 className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {org.name}
                </h3>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--text-tertiary)' }}>
                    <Users className="w-3 h-3" />
                    {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--text-tertiary)' }}>
                    <GitBranch className="w-3 h-3" />
                    {org.branch_count} branch{org.branch_count !== 1 ? 'es' : ''}
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

      {/* Create Org Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowCreateModal(false)}
          />

          {/* Modal */}
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
                Create Organization
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

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-primary)' }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Manufacturing"
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
                {newOrgName.trim() && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Slug: {slugify(newOrgName)}
                  </p>
                )}
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
                  disabled={creating || !newOrgName.trim()}
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
