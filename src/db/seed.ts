import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function shouldSeedDemoData(): boolean {
  return String(process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() === 'true';
}

export async function runDatabaseInitAndSeed() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('No DATABASE_URL configured. Skipping database seed.');
    return;
  }

  if (!shouldSeedDemoData()) {
    console.log('SEED_DEMO_DATA is not enabled. Skipping demo seed.');
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl:
      connectionString.startsWith('postgresql://') &&
      !connectionString.includes('localhost')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    console.log('Connecting to PostgreSQL to run demo seeds...');

    // IMPORTANT:
    // Schema creation is handled exclusively by Drizzle migrations.
    // This seed file only inserts development/demo data.

    const productCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM products',
    );

    if (productCountResult.rows[0]?.count === 0) {
      console.log('Seeding initial products into PostgreSQL...');

      await pool.query(`
        INSERT INTO products (
          id,
          title,
          price,
          currency,
          brand,
          rating,
          reviews_count,
          free_shipping,
          "full",
          country_code,
          image,
          description
        )
        VALUES
          (
            'prod-10',
            'Notebook Gamer Acer Nitro V15 15.6" Full HD 144Hz Intel Core i5 13ª Geração 16GB RAM SSD 512GB RTX 3050 Windows 11',
            4599,
            'BRL',
            'Acer',
            4.8,
            1420,
            true,
            true,
            'BR',
            'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&q=80&w=800',
            'Notebook de alta performance com Intel Core i5-13420H, 16GB DDR5 5200MHz, placa de vídeo dedicada NVIDIA GeForce RTX 3050 6GB GDDR6, SSD 512GB NVMe PCIe 4.0 e tela IPS 144Hz Full HD.'
          ),
          (
            'prod-11',
            'Fritadeira Elétrica Sem Óleo Air Fryer Philips Walita Digital Série 3000 4.1L 1400W Tecnologia RapidAir',
            449.90,
            'BRL',
            'Philips Walita',
            4.9,
            4890,
            true,
            true,
            'BR',
            'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&q=80&w=800',
            'Air Fryer Digital 4.1L com tecnologia patenteada RapidAir (fluxo de ar ciclônico 360°), display touch screen com 7 receitas pré-definidas, cesto antiaderente QuickClean lavável em lava-louças.'
          ),
          (
            'prod-12',
            'Perfume Masculino Giorgio Armani Acqua Di Giò Eau de Toilette 100ml Original com Selo ADIPEC',
            589,
            'BRL',
            'Giorgio Armani',
            5.0,
            3120,
            true,
            true,
            'BR',
            'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800',
            'Fragrância aquática aromática icônica com notas cítricas de bergamota da Calábria, acordes oceânicos puros e madeiras nobres de cedro e patchouli. 100% original importado com selo oficial ADIPEC.'
          ),
          (
            'p1',
            'Smartphone Samsung Galaxy S24 Ultra 512GB 5G',
            850000,
            'XOF',
            'Samsung',
            4.9,
            128,
            true,
            true,
            'GW',
            'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&q=80&w=800',
            'Excelente smartphone top de linha com câmera de 200MP e processador Snapdragon 8 Gen 3.'
          ),
          (
            'p2',
            'Apple iPhone 15 Pro Max 256GB Titânio Natural',
            980000,
            'XOF',
            'Apple',
            5.0,
            240,
            true,
            true,
            'GW',
            'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=800',
            'iPhone com acabamento em Titânio, chip A17 Pro e botão de Ação.'
          ),
          (
            'p3',
            'Ar Condicionado Inverter Split LG Dual 12.000 BTUs',
            320000,
            'XOF',
            'LG',
            4.8,
            85,
            false,
            true,
            'GW',
            'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=800',
            'Economia de energia de até 70% com refrigeração ultra rápida para o clima de Bissau.'
          ),
          (
            'p4',
            'Televisor Smart TV 65" 4K OLED LG C3 120Hz',
            650000,
            'XOF',
            'LG',
            4.9,
            94,
            true,
            false,
            'GW',
            'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&q=80&w=800',
            'A melhor experiência em jogos e cinema com pretos perfeitos OLED.'
          ),
          (
            'p5',
            'Computador Portátil Apple MacBook Air M3 16GB 512GB',
            790000,
            'XOF',
            'Apple',
            5.0,
            112,
            true,
            true,
            'GW',
            'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=800',
            'Leve, potente e com autonomia de bateria impressionante de até 18 horas.'
          ),
          (
            'p6',
            'Gerador a Diesel Silencioso Trifásico 15 kVA Nusali Power',
            1850000,
            'XOF',
            'Nusali Power',
            4.9,
            38,
            true,
            true,
            'GW',
            'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=800',
            'Gerador de alta capacidade para residências e comércios com transferência automática ATS.'
          )
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Seeded products successfully.');
    } else {
      console.log('Products table already contains data. Skipping product seed.');
    }

    const regionCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM regions',
    );

    if (regionCountResult.rows[0]?.count === 0) {
      console.log('Seeding regions into PostgreSQL...');

      await pool.query(`
        INSERT INTO regions (
          id,
          name,
          country_code,
          supervisor_name,
          supervisor_email,
          delivery_coverage_days,
          freight_base_rate
        )
        VALUES
          (
            'REG-GW-01',
            'SAB - Setor Autónomo de Bissau',
            'GW',
            'Domingos Nhaga',
            'domingos.nhaga@nusali.com',
            'Mesmo Dia (6h)',
            '1.000 XOF'
          ),
          (
            'REG-GW-02',
            'Região de Biombo (Quinhámel)',
            'GW',
            'Mariama Camará',
            'mariama.camara@nusali.com',
            '24 Horas',
            '1.500 XOF'
          ),
          (
            'REG-GW-03',
            'Região de Bafatá',
            'GW',
            'Amadu Bá',
            'amadu.ba@nusali.com',
            '24-48 Horas',
            '2.000 XOF'
          ),
          (
            'REG-GW-04',
            'Região de Gabú',
            'GW',
            'Suleimane Djaló',
            'suleimane.djalo@nusali.com',
            '48 Horas',
            '2.500 XOF'
          )
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Seeded regions successfully.');
    } else {
      console.log('Regions table already contains data. Skipping region seed.');
    }

    const warehouseCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM warehouses',
    );

    if (warehouseCountResult.rows[0]?.count === 0) {
      console.log('Seeding warehouses into PostgreSQL...');

      await pool.query(`
        INSERT INTO warehouses (
          id,
          code,
          name,
          country_code,
          city,
          address,
          manager_name,
          staff_count
        )
        VALUES
          (
            'wh-01',
            'HUB-BSA-01',
            'Armazém Central de Bissau (Nusali Full)',
            'GW',
            'Bissau',
            'Avenida dos Combatentes da Liberdade da Pátria',
            'Mamadu Saliu',
            24
          ),
          (
            'wh-02',
            'HUB-BFT-01',
            'Centro Logístico Regional de Bafatá',
            'GW',
            'Bafatá',
            'Bairro Comercial - Bafatá',
            'Umaro Djalo',
            10
          ),
          (
            'wh-03',
            'HUB-LIS-01',
            'HUB Internacional Lisboa Nusali Cross-Border',
            'PT',
            'Lisboa',
            'Plataforma Logística de Lisboa Norte',
            'Rui Silva',
            18
          )
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Seeded warehouses successfully.');
    } else {
      console.log('Warehouses table already contains data. Skipping warehouse seed.');
    }

    console.log('Database demo seed completed successfully.');
  } catch (err: any) {
    console.warn(
      'PostgreSQL demo seed skipped:',
      err?.message || err,
    );
  } finally {
    try {
      await pool.end();
    } catch {
      // Ignore close errors.
    }
  }
}

if (
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js')
) {
  runDatabaseInitAndSeed();
}