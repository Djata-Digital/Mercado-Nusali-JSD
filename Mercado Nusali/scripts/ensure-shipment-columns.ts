import 'dotenv/config';
import { getDbPool } from '../src/db/index.js';

async function ensureColumns() {
  const pool = getDbPool();
  if (!pool) {
    console.error('Database pool unavailable.');
    process.exit(1);
  }

  try {
    console.log('Ensuring PostgreSQL columns for logistics & shipments...');
    await pool.query(`
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "order_item_id" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "seller_id" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "buyer_id" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT';
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "recipient_name" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "recipient_address_json" jsonb;
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sender_name" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sender_address_json" jsonb;
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp;
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "received_by" varchar(255);
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "failure_reason" text;
      ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "notes" text;

      ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipment_id" varchar(255);
      ALTER TABLE "tracking_events" ADD COLUMN IF NOT EXISTS "performed_by" varchar(255);

      CREATE TABLE IF NOT EXISTS "proof_of_delivery" (
        "id" varchar(255) PRIMARY KEY,
        "shipment_id" varchar(255) NOT NULL REFERENCES "shipments"("id") ON DELETE CASCADE,
        "received_by" varchar(255) NOT NULL,
        "delivered_at" timestamp DEFAULT NOW() NOT NULL,
        "proof_type" varchar(50) DEFAULT 'BUYER_CONFIRMATION' NOT NULL,
        "proof_url" text,
        "notes" text,
        "created_at" timestamp DEFAULT NOW() NOT NULL
      );
    `);
    console.log('✅ PostgreSQL columns for shipments ensured successfully!');
  } catch (err) {
    console.error('Error ensuring columns:', err);
  } finally {
    await pool.end();
  }
}

ensureColumns();
