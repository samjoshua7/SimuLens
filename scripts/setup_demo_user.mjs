import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const email = 'demo@gmail.com';
  const password = 'demo123!';

  console.log(`Checking if user ${email} exists in Supabase Auth...`);

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError.message);
    process.exit(1);
  }

  const existingUser = users.find((u) => u.email === email);

  if (existingUser) {
    console.log(`User ${email} already exists with ID: ${existingUser.id}. Updating password...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Demo Engineer' },
    });
    if (updateError) {
      console.error('Error updating user:', updateError.message);
      process.exit(1);
    }
    console.log('Password updated and email confirmed successfully!');
  } else {
    console.log(`Creating user ${email}...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Demo Engineer' },
    });
    if (createError) {
      console.error('Error creating user:', createError.message);
      process.exit(1);
    }
    console.log(`User created successfully with ID: ${newUser.user.id}!`);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
