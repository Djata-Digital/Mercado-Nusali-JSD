export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  role: string;
  roleLabel: string;
  status: 'active' | 'suspended' | 'blocked' | 'pending_kyc';
  createdAt: string;
  lastLogin: string;
  ordersCount: number;
  purchasesCount: number;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  avatar?: string;
}

export const mockAdminUsersList: AdminUserRecord[] = [
  {
    id: 'USR-901',
    name: 'Amadou Diallo',
    email: 'amadou.diallo@gmail.com',
    phone: '+245 95 611 2233',
    country: 'GW',
    role: 'buyer',
    roleLabel: 'Comprador',
    status: 'active',
    createdAt: '12/01/2025',
    lastLogin: 'Há 10 minutos',
    ordersCount: 14,
    purchasesCount: 14,
    riskScore: 'baixo',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'USR-902',
    name: 'Carlos Biai',
    email: 'carlos.biai@nusali.gw',
    phone: '+245 96 444 5566',
    country: 'GW',
    role: 'seller',
    roleLabel: 'Vendedor Verificado',
    status: 'active',
    createdAt: '05/02/2025',
    lastLogin: 'Há 2 horas',
    ordersCount: 420,
    purchasesCount: 2,
    riskScore: 'baixo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'USR-903',
    name: 'Maria Silva',
    email: 'maria.silva@hotmail.com',
    phone: '+55 11 97654-3210',
    country: 'BR',
    role: 'buyer',
    roleLabel: 'Compradora Plus',
    status: 'active',
    createdAt: '18/11/2024',
    lastLogin: 'Hoje às 11:30',
    ordersCount: 38,
    purchasesCount: 38,
    riskScore: 'baixo',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'USR-904',
    name: 'Soluções Agrícolas Lda',
    email: 'contato@solucoesagricolas.gw',
    phone: '+245 95 888 9900',
    country: 'GW',
    role: 'seller',
    roleLabel: 'Vendedor Empresarial',
    status: 'active',
    createdAt: '01/10/2024',
    lastLogin: 'Ontem às 16:40',
    ordersCount: 1250,
    purchasesCount: 5,
    riskScore: 'baixo'
  },
  {
    id: 'USR-905',
    name: 'João Pedro Santos',
    email: 'jpsantos@yahoo.com.br',
    phone: '+55 21 99887-1122',
    country: 'BR',
    role: 'buyer',
    roleLabel: 'Comprador',
    status: 'suspended',
    createdAt: '03/03/2025',
    lastLogin: 'Há 3 dias',
    ordersCount: 2,
    purchasesCount: 2,
    riskScore: 'medio'
  },
  {
    id: 'USR-906',
    name: 'EletroBissau Ltda',
    email: 'sac@eletrobissau.gw',
    phone: '+245 96 123 4567',
    country: 'GW',
    role: 'seller',
    roleLabel: 'Vendedor Oficial',
    status: 'pending_kyc',
    createdAt: 'Há 2 dias',
    lastLogin: 'Hoje às 08:12',
    ordersCount: 0,
    purchasesCount: 0,
    riskScore: 'baixo'
  },
  {
    id: 'USR-907',
    name: 'Kumba Dabó',
    email: 'kumba.dabo@gmail.com',
    phone: '+245 95 000 1111',
    country: 'GW',
    role: 'buyer',
    roleLabel: 'Comprador',
    status: 'blocked',
    createdAt: '15/01/2025',
    lastLogin: 'Há 2 semanas',
    ordersCount: 1,
    purchasesCount: 0,
    riskScore: 'critico'
  }
];
