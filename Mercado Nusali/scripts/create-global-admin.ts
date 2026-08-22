import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina ${name} antes de executar este comando.`);
  }
  return value;
}

async function main() {
  const databaseUrl = required('DATABASE_URL');
  const email = required('GLOBAL_ADMIN_EMAIL').toLowerCase();
  const password = required('GLOBAL_ADMIN_PASSWORD');
  const fullName = (process.env.GLOBAL_ADMIN_NAME || 'Administrador Geral Nusali').trim();
  const phone = (process.env.GLOBAL_ADMIN_PHONE || '').trim();
  const countryCode = (process.env.GLOBAL_ADMIN_COUNTRY || 'GW').trim().toUpperCase();

  if (password.length < 10) {
    throw new Error('GLOBAL_ADMIN_PASSWORD deve ter pelo menos 10 caracteres.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.startsWith('postgresql://') && !databaseUrl.includes('localhost')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email],
    );

    const userId = existing.rows[0]?.id || `usr_global_admin_${Date.now()}`;

    if (existing.rows.length) {
      await client.query(
        `UPDATE users
         SET password_hash = $2,
             full_name = $3,
             phone = NULLIF($4, ''),
             role = 'GLOBAL_ADMIN',
             country_code = $5,
             kyc_status = 'verified',
             risk_score = 'baixo',
             is_active = true,
             is_email_verified = true,
             is_phone_verified = true,
             updated_at = NOW()
         WHERE id = $1`,
        [userId, passwordHash, fullName, phone, countryCode],
      );
    } else {
      await client.query(
        `INSERT INTO users (
          id, email, password_hash, full_name, phone, role, country_code,
          kyc_status, risk_score, is_active, is_email_verified,
          is_phone_verified, is_two_factor_enabled, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, NULLIF($5, ''), 'GLOBAL_ADMIN', $6,
          'verified', 'baixo', true, true, true, false, NOW(), NOW()
        )`,
        [userId, email, passwordHash, fullName, phone, countryCode],
      );
    }

    const roleResult = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'GLOBAL_ADMIN' LIMIT 1`,
    );

    let roleId = roleResult.rows[0]?.id;
    if (!roleId) {
      roleId = 'role_global_admin';
      await client.query(
        `INSERT INTO roles (id, name, description, created_at)
         VALUES ($1, 'GLOBAL_ADMIN', 'Administrador Geral com acesso global à plataforma Nusali.', NOW())`,
        [roleId],
      );
    }

    await client.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId],
    );

    await client.query('COMMIT');

    console.log('GLOBAL_ADMIN criado/atualizado com sucesso.');
    console.log(`ID: ${userId}`);
    console.log(`E-mail: ${email}`);
    console.log(`País: ${countryCode}`);
    console.log('E-mail e telefone marcados como verificados para permitir o primeiro acesso administrativo.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao criar GLOBAL_ADMIN:', error instanceof Error ? error.message : error);
  process.exit(1);
});
