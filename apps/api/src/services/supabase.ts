import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { ExperimentRecord } from '@simulens/shared';

dotenv.config({ path: '../../.env' });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private inMemoryExperiments: Map<string, ExperimentRecord> = new Map();

  constructor() {
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        this.client = createClient(supabaseUrl, supabaseKey);
        console.log('[SupabaseService] Connected to Supabase PostgreSQL at:', supabaseUrl);
      } catch (err) {
        console.warn('[SupabaseService] Failed to initialize Supabase client, using in-memory store:', err);
      }
    } else {
      console.log('[SupabaseService] Supabase credentials not set or placeholder detected. Operating in local in-memory persistence mode.');
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  async saveExperiment(experiment: ExperimentRecord): Promise<ExperimentRecord> {
    const id = experiment.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: ExperimentRecord = {
      ...experiment,
      id,
      created_at: experiment.created_at || new Date().toISOString(),
    };

    if (this.client) {
      const { data, error } = await this.client.from('experiments').insert({
        id: record.id,
        name: record.name,
        description: record.description,
        initial_state: record.initial_state,
        actions: record.actions,
        environment: record.environment,
        seed: record.seed,
        predicted_trajectory: record.predicted_trajectory,
        actual_trajectory: record.actual_trajectory,
        intervention: record.intervention,
        counterfactual: record.counterfactual,
        uncertainty: record.predicted_trajectory.steps,
        metrics: record.metrics,
      }).select().single();

      if (error) {
        console.error('[SupabaseService] Error inserting experiment to Supabase:', error.message);
        this.inMemoryExperiments.set(id, record);
      } else if (data) {
        return { ...record, id: data.id };
      }
    } else {
      this.inMemoryExperiments.set(id, record);
    }

    return record;
  }

  async listExperiments(): Promise<ExperimentRecord[]> {
    if (this.client) {
      const { data, error } = await this.client.from('experiments').select('*').order('created_at', { ascending: false }).limit(50);
      if (!error && data) {
        return data as unknown as ExperimentRecord[];
      }
    }
    return Array.from(this.inMemoryExperiments.values()).reverse();
  }

  async getExperiment(id: string): Promise<ExperimentRecord | null> {
    if (this.client) {
      const { data, error } = await this.client.from('experiments').select('*').eq('id', id).single();
      if (!error && data) {
        return data as unknown as ExperimentRecord;
      }
    }
    return this.inMemoryExperiments.get(id) || null;
  }
}

export const supabaseService = new SupabaseService();
