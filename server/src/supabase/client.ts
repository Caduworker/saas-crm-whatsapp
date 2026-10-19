import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import type { Database } from '../types/dominio.js';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey);
