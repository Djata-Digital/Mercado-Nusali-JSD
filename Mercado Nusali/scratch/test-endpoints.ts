import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { adminRouter } from '../src/server/adminRoutes.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resetDbPool } from '../src/db/index.js';

async function testEndpoints() {
  console.log('==================================================');
  console.log('TESTE REQUISITADO NOS ENDPOINTS HTTP DE ADMIN');
  console.log('==================================================\n');

  const secret = getJwtAccessSecret();
  const token = jwt.sign(
    { userId: 'usr_admin_test', id: 'usr_admin_test', email: 'admin@mercadonusali.com', role: 'admin', userType: 'admin' },
    secret,
    { expiresIn: '1h' }
  );

  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1/admin`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. GET /shipping-rates
    console.log('--- 1. GET /api/v1/admin/shipping-rates ---');
    const r1 = await fetch(`${baseUrl}/shipping-rates`, { headers });
    const data1 = await r1.json() as any;
    console.log('HTTP Status:', r1.status);
    console.log('Response Body:', data1);

    if (r1.status !== 200 || !data1.success) {
      console.error('FAIL endpoint 1');
      process.exit(1);
    }

    // 2. GET /logistics/shipments?status=todos&fulfillmentMode=todos&countryCode=todos&search=
    console.log('\n--- 2. GET /api/v1/admin/logistics/shipments ---');
    const r2 = await fetch(`${baseUrl}/logistics/shipments?status=todos&fulfillmentMode=todos&countryCode=todos&search=`, { headers });
    const data2 = await r2.json() as any;
    console.log('HTTP Status:', r2.status);
    console.log('Response Items Count:', Array.isArray(data2.data) ? data2.data.length : 'N/A');

    if (r2.status !== 200 || !data2.success) {
      console.error('FAIL endpoint 2');
      process.exit(1);
    }

    console.log('\nAMBOS OS ENDPOINTS HTTP AUTENTICADOS RETORNARAM HTTP 200 COM SUCESSO!');
  } finally {
    server.close();
    resetDbPool();
  }
}

testEndpoints();
