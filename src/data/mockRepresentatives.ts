export interface CountryRepresentative {
  id: string;
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  countryName: string;
  status: 'active' | 'suspended' | 'pending';
  assignedSellersCount: number;
  assignedStoresCount: number;
  monthlyOrders: number;
  monthlyRevenueFormatted: string;
  supervisorsCount: number;
  performanceScore: number; // 0-100
  targetGMVFormatted: string;
  commissionRate: string;
  lastLogin: string;
  avatar: string;
}

export const mockRepresentativesList: CountryRepresentative[] = [
  {
    id: 'REP-GW-01',
    name: 'Malam Bacai Sanhá Jr.',
    email: 'malam.sanha@nusali.gw',
    phone: '+245 95 520 1010',
    countryCode: 'GW',
    countryName: 'Guiné-Bissau',
    status: 'active',
    assignedSellersCount: 329,
    assignedStoresCount: 249,
    monthlyOrders: 7420,
    monthlyRevenueFormatted: '185.400.000 XOF',
    supervisorsCount: 8,
    performanceScore: 96,
    targetGMVFormatted: '200.000.000 XOF',
    commissionRate: '1.2%',
    lastLogin: 'Hoje às 14:22',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'REP-BR-01',
    name: 'Juliana Mendes',
    email: 'juliana.mendes@nusali.br',
    phone: '+55 11 98765-4321',
    countryCode: 'BR',
    countryName: 'Brasil',
    status: 'active',
    assignedSellersCount: 390,
    assignedStoresCount: 305,
    monthlyOrders: 18700,
    monthlyRevenueFormatted: 'R$ 1.870.000,00',
    supervisorsCount: 5,
    performanceScore: 94,
    targetGMVFormatted: 'R$ 2.000.000,00',
    commissionRate: '1.0%',
    lastLogin: 'Hoje às 15:40',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'REP-PT-01',
    name: 'Rui Fernandes',
    email: 'rui.fernandes@nusali.pt',
    phone: '+351 91 234 5678',
    countryCode: 'PT',
    countryName: 'Portugal',
    status: 'active',
    assignedSellersCount: 160,
    assignedStoresCount: 130,
    monthlyOrders: 8500,
    monthlyRevenueFormatted: '€ 425.000,00',
    supervisorsCount: 3,
    performanceScore: 91,
    targetGMVFormatted: '€ 450.000,00',
    commissionRate: '0.9%',
    lastLogin: 'Ontem às 18:10',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'REP-AO-01',
    name: 'Mateus Kiala',
    email: 'mateus.kiala@nusali.ao',
    phone: '+244 923 456 789',
    countryCode: 'AO',
    countryName: 'Angola',
    status: 'active',
    assignedSellersCount: 120,
    assignedStoresCount: 94,
    monthlyOrders: 6200,
    monthlyRevenueFormatted: '310.000.000 Kz',
    supervisorsCount: 4,
    performanceScore: 88,
    targetGMVFormatted: '350.000.000 Kz',
    commissionRate: '1.1%',
    lastLogin: 'Hoje às 09:15',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80'
  }
];
