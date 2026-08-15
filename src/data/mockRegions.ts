export interface RegionData {
  id: string;
  countryCode: string;
  name: string;
  supervisorName: string;
  supervisorEmail: string;
  cities: string[];
  activeSellers: number;
  activeStores: number;
  monthlyOrders: number;
  deliveryCoverageDays: string;
  freightBaseRate: string;
  status: 'active' | 'expanding' | 'paused';
}

export const mockRegionsList: RegionData[] = [
  // Guiné-Bissau
  {
    id: 'REG-GW-01',
    countryCode: 'GW',
    name: 'Setor Autónomo de Bissau',
    supervisorName: 'Mussá Mane',
    supervisorEmail: 'mussa.mane@nusali.gw',
    cities: ['Bissau Velho', 'Bandim', 'Bairro Militar', 'Prabis', 'Safim', 'Antula', 'Bissalanca'],
    activeSellers: 145,
    activeStores: 112,
    monthlyOrders: 3200,
    deliveryCoverageDays: '24 horas',
    freightBaseRate: '1.500 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-02',
    countryCode: 'GW',
    name: 'Região de Biombo',
    supervisorName: 'Mamadu Candé',
    supervisorEmail: 'mamadu.cande@nusali.gw',
    cities: ['Quinhamel', 'Sintra', 'Ondo'],
    activeSellers: 28,
    activeStores: 19,
    monthlyOrders: 650,
    deliveryCoverageDays: '24-48 horas',
    freightBaseRate: '2.500 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-03',
    countryCode: 'GW',
    name: 'Região de Cacheu',
    supervisorName: 'Tidjane Djaló',
    supervisorEmail: 'tidjane.djalo@nusali.gw',
    cities: ['Cacheu', 'Canchungo', 'São Domingos', 'Caió'],
    activeSellers: 34,
    activeStores: 26,
    monthlyOrders: 820,
    deliveryCoverageDays: '48 horas',
    freightBaseRate: '3.000 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-04',
    countryCode: 'GW',
    name: 'Região de Oio',
    supervisorName: 'Sene Biai',
    supervisorEmail: 'sene.biai@nusali.gw',
    cities: ['Farim', 'Mansôa', 'Bissora'],
    activeSellers: 22,
    activeStores: 15,
    monthlyOrders: 540,
    deliveryCoverageDays: '48 horas',
    freightBaseRate: '3.000 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-05',
    countryCode: 'GW',
    name: 'Região de Bafatá',
    supervisorName: 'Fatoumata Balde',
    supervisorEmail: 'fatoumata.balde@nusali.gw',
    cities: ['Bafatá', 'Gabu', 'Contuboel', 'Bambadinca'],
    activeSellers: 40,
    activeStores: 32,
    monthlyOrders: 980,
    deliveryCoverageDays: '48-72 horas',
    freightBaseRate: '3.500 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-06',
    countryCode: 'GW',
    name: 'Região de Gabú',
    supervisorName: 'Ousmane Sow',
    supervisorEmail: 'ousmane.sow@nusali.gw',
    cities: ['Gabú', 'Pitche', 'Pirada', 'Boe'],
    activeSellers: 31,
    activeStores: 22,
    monthlyOrders: 710,
    deliveryCoverageDays: '72 horas',
    freightBaseRate: '4.000 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-07',
    countryCode: 'GW',
    name: 'Região de Quinara & Tombali',
    supervisorName: 'Kumba Yala Jr.',
    supervisorEmail: 'kumba.yala@nusali.gw',
    cities: ['Buba', 'Catió', 'Bedanda', 'Empada'],
    activeSellers: 18,
    activeStores: 12,
    monthlyOrders: 390,
    deliveryCoverageDays: '72 horas',
    freightBaseRate: '4.500 XOF',
    status: 'active'
  },
  {
    id: 'REG-GW-08',
    countryCode: 'GW',
    name: 'Arquipélago Bolama/Bijagós',
    supervisorName: 'Djenabu Indjai',
    supervisorEmail: 'djenabu.indjai@nusali.gw',
    cities: ['Bolama', 'Bubaque', 'Caravela', 'Uno'],
    activeSellers: 12,
    activeStores: 8,
    monthlyOrders: 210,
    deliveryCoverageDays: '3-5 dias (Barco/Lancha)',
    freightBaseRate: '5.000 XOF',
    status: 'active'
  },

  // Brasil
  {
    id: 'REG-BR-01',
    countryCode: 'BR',
    name: 'Sudeste (São Paulo & Rio de Janeiro)',
    supervisorName: 'Rodrigo Albuquerque',
    supervisorEmail: 'rodrigo.alb@nusali.br',
    cities: ['São Paulo', 'Campinas', 'Guarulhos', 'Rio de Janeiro', 'Niterói', 'Belo Horizonte'],
    activeSellers: 280,
    activeStores: 220,
    monthlyOrders: 14500,
    deliveryCoverageDays: '1-2 dias úteis',
    freightBaseRate: 'R$ 18,90',
    status: 'active'
  },
  {
    id: 'REG-BR-02',
    countryCode: 'BR',
    name: 'Nordeste',
    supervisorName: 'Clara Vasconcelos',
    supervisorEmail: 'clara.v@nusali.br',
    cities: ['Salvador', 'Recife', 'Fortaleza', 'Maceió', 'São Luís'],
    activeSellers: 110,
    activeStores: 85,
    monthlyOrders: 4200,
    deliveryCoverageDays: '3-5 dias úteis',
    freightBaseRate: 'R$ 24,90',
    status: 'active'
  },

  // Portugal
  {
    id: 'REG-PT-01',
    countryCode: 'PT',
    name: 'Lisboa & Margem Sul',
    supervisorName: 'Tiago Oliveira',
    supervisorEmail: 'tiago.o@nusali.pt',
    cities: ['Lisboa', 'Sintra', 'Cascais', 'Setúbal', 'Almada', 'Amadora'],
    activeSellers: 95,
    activeStores: 78,
    monthlyOrders: 5100,
    deliveryCoverageDays: '24 horas',
    freightBaseRate: '€ 4,50',
    status: 'active'
  },
  {
    id: 'REG-PT-02',
    countryCode: 'PT',
    name: 'Norte (Porto & Braga)',
    supervisorName: 'Sofia Costa',
    supervisorEmail: 'sofia.c@nusali.pt',
    cities: ['Porto', 'Vila Nova de Gaia', 'Braga', 'Guimarães', 'Matosinhos'],
    activeSellers: 65,
    activeStores: 52,
    monthlyOrders: 3400,
    deliveryCoverageDays: '24-48 horas',
    freightBaseRate: '€ 4,90',
    status: 'active'
  },

  // Angola
  {
    id: 'REG-AO-01',
    countryCode: 'AO',
    name: 'Luanda Metropolitana',
    supervisorName: 'Fernando Kassoma',
    supervisorEmail: 'fernando.k@nusali.ao',
    cities: ['Luanda', 'Viana', 'Cacuaco', 'Belas', 'Talatona', 'Cazenga'],
    activeSellers: 120,
    activeStores: 94,
    monthlyOrders: 6200,
    deliveryCoverageDays: '24-48 horas',
    freightBaseRate: '2.500 Kz',
    status: 'active'
  }
];
