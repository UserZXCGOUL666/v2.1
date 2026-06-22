const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const config = require('../src/config');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  if (config.adminEmail && config.adminPassword) {
    if (config.adminPassword.length < 10) {
      throw new Error('ADMIN_PASSWORD должен содержать минимум 10 символов');
    }

    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    await pool.query(
      `INSERT INTO admin_users (id, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, 'admin')
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
      [`adm_${crypto.randomUUID()}`, config.adminEmail, passwordHash]
    );
    console.log(`Admin account is ready: ${config.adminEmail}`);
  } else {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD are empty. Admin account was not created.');
  }

  console.log('Database schema is ready.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
