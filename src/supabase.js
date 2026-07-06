const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
  throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong file .env');
}

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
  auth: {
    persistSession: false
  }
});

module.exports = supabase;
