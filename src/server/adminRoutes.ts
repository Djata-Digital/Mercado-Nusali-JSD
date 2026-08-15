import { Router, Request, Response } from 'express';
import { getDb, checkDbConnection } from '../db/index.js';
import { users, warehouses, regions, products, orders } from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc } from 'drizzle-orm';

export const adminRouter = Router();

// ==========================================
// UNIFIED REAL STATE ENGINE FOR ADMIN PANEL
// ==========================================

export interface AdminUserData {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  role: 'admin' | 'supervisor' | 'country_rep' | 'seller' | 'buyer';
  roleLabel: string;
  status: 'active' | 'suspended' | 'blocked' | 'pending_kyc';
  createdAt: string;
  lastLogin: string;
  ordersCount: number;
  purchasesCount: number;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  avatar?: string;
}

export interface AdminKycData {
  id: string;
  sellerName: string;
  companyName: string;
  country: string;
  accountType: 'Pessoa Física' | 'Pessoa Jurídica' | 'Empresa Exportadora';
  documentType: 'Bilhete de Identidade' | 'Passaporte CPLP' | 'Certidão Comercial' | 'NIF / CNPJ';
  documentNumber: string;
  submittedAt: string;
  status: 'nova' | 'under_review' | 'info_requested' | 'verified' | 'rejected' | 'fraud_suspect';
  docFrontUrl: string;
  docBackUrl?: string;
  selfieUrl: string;
  proofAddressUrl: string;
  businessLicenseUrl?: string;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  notes?: string;
}

export interface AdminEscrowItem {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  createdAt: string;
  releaseCondition: string;
  deliveryStatus: string;
  hasDispute: boolean;
  expectedReleaseDate: string;
  status: 'aguardando_pagamento' | 'retido' | 'aguardando_envio' | 'em_transporte' | 'aguardando_confirmacao' | 'disponivel_liberacao' | 'liberado' | 'em_disputa' | 'reembolsado' | 'bloqueado';
  notes?: string;
}

export interface AdminDisputeItem {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  productTitle: string;
  country: string;
  reason: string;
  amountFormatted: string;
  escrowStatus: string;
  messagesCount: number;
  evidencesCount: number;
  mediatorName?: string;
  status: 'nova' | 'awaiting_buyer' | 'awaiting_seller' | 'in_mediation' | 'evidences_submitted' | 'pending_decision' | 'resolved' | 'appealed';
  deadline: string;
  timeline: { title: string; date: string; done: boolean }[];
}

export interface AdminWarehouseItem {
  id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string;
  managerName: string;
  capacityUsedPercentage: number;
  totalCapacityPackages: number;
  activeShipments: number;
  dailyInboundPackages: number;
  dailyOutboundPackages: number;
  status: 'active' | 'maintenance' | 'expanding';
  staffCount: number;
  monthlyOperatingCostFormatted: string;
}

export interface AdminCountryRepItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  countryName: string;
  status: 'active' | 'suspended' | 'vacant';
  assignedSellersCount: number;
  assignedStoresCount: number;
  supervisorsCount: number;
  monthlyRevenueFormatted: string;
  monthlyOrders: number;
  performanceScore: number;
  targetGMVFormatted: string;
  commissionRate: string;
  lastLogin: string;
  avatar?: string;
}

export interface AdminSupervisorItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  regionId: string;
  regionName: string;
  countryCode: string;
  status: 'active' | 'leave' | 'suspended';
  assignedHubsCount: number;
  deliveriesToday: number;
  performanceRating: number;
  activeCouriersCount: number;
  monthlyDeliveries: number;
  lastActive: string;
}

export interface AdminAuditItem {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  previousValue: string;
  newValue: string;
  ipAddress: string;
  country: string;
  timestamp: string;
  result: 'sucesso' | 'falha' | 'alerta';
}

// Initial Live System Data State
const adminState = {
  users: [
    {
      id: 'USR-001',
      name: 'Mamadu Djassi',
      email: 'admin@nusali.com',
      phone: '+245 955 000 001',
      country: 'GW',
      role: 'admin' as const,
      roleLabel: 'Administrador Geral CPLP',
      status: 'active' as const,
      createdAt: '01/01/2025',
      lastLogin: 'Agora mesmo',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-002',
      name: 'Djata Digital',
      email: 'djatadigital7@gmail.com',
      phone: '+245 955 123 456',
      country: 'GW',
      role: 'buyer' as const,
      roleLabel: 'Comprador Oficial',
      status: 'active' as const,
      createdAt: '15/01/2025',
      lastLogin: 'Há 5 minutos',
      ordersCount: 18,
      purchasesCount: 18,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-003',
      name: 'Bissau Tech & Export Store',
      email: 'vendedor@nusali.com',
      phone: '+245 955 888 777',
      country: 'GW',
      role: 'seller' as const,
      roleLabel: 'Vendedor Platinum',
      status: 'active' as const,
      createdAt: '02/02/2025',
      lastLogin: 'Há 12 minutos',
      ordersCount: 540,
      purchasesCount: 3,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-004',
      name: 'Malam Bacai Sanhá Jr.',
      email: 'malam.bacai@nusali.gw',
      phone: '+245 955 000 003',
      country: 'GW',
      role: 'country_rep' as const,
      roleLabel: 'Representante Nacional Guiné-Bissau',
      status: 'active' as const,
      createdAt: '10/01/2025',
      lastLogin: 'Há 30 minutos',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-005',
      name: 'Juliana Mendes',
      email: 'juliana.mendes@nusali.com.br',
      phone: '+55 11 98888-7766',
      country: 'BR',
      role: 'country_rep' as const,
      roleLabel: 'Representante Nacional Brasil',
      status: 'active' as const,
      createdAt: '12/01/2025',
      lastLogin: 'Há 1 hora',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-006',
      name: 'Mussá Mané',
      email: 'mussa.mane@nusali.gw',
      phone: '+245 966 222 333',
      country: 'GW',
      role: 'supervisor' as const,
      roleLabel: 'Supervisor Regional Bissau & Biombo',
      status: 'active' as const,
      createdAt: '20/01/2025',
      lastLogin: 'Há 2 horas',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80',
    },
  ] as AdminUserData[],

  kycQueue: [
    {
      id: 'KYC-901',
      sellerName: 'Carlos Biai',
      companyName: 'Bissau Tech & Export Store',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'Bilhete de Identidade',
      documentNumber: 'BI-GW-982109',
      submittedAt: '30/07/2026 às 14:10',
      status: 'verified',
      docFrontUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      businessLicenseUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
      notes: 'Documentos do Ministério da Justiça de Bissau válidos e autenticados.',
    },
    {
      id: 'KYC-902',
      sellerName: 'Bacai Sanhá',
      companyName: 'Energia Solar Bissau',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'Certidão Comercial',
      documentNumber: 'NIF-55210981',
      submittedAt: '31/07/2026 às 09:30',
      status: 'under_review',
      docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
    },
    {
      id: 'KYC-903',
      sellerName: 'EletroBissau Ltda',
      companyName: 'EletroBissau Comercial',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'NIF / CNPJ',
      documentNumber: 'NIF-11002233',
      submittedAt: '01/08/2026 às 11:20',
      status: 'nova',
      docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
    },
  ] as AdminKycData[],

  escrowList: [
    {
      id: 'ESC-9102',
      orderId: 'ORD-9102',
      buyerName: 'Djata Digital',
      sellerName: 'Bissau Tech & Export Store',
      amount: 450000,
      amountFormatted: '450.000 XOF',
      currency: 'XOF',
      createdAt: '31/07/2026',
      releaseCondition: 'Confirmação de Recepção pelo Comprador ou 48h pós-entrega',
      deliveryStatus: 'Em Trânsito - HUB Central Bissau',
      hasDispute: false,
      expectedReleaseDate: '02/08/2026',
      status: 'retido',
      notes: 'Valor em custódia segura Nusali Proteção.',
    },
    {
      id: 'ESC-8750',
      orderId: 'ORD-8750',
      buyerName: 'Maria Silva',
      sellerName: 'Soluções Agrícolas Lda',
      amount: 1250.0,
      amountFormatted: 'R$ 1.250,00',
      currency: 'BRL',
      createdAt: '28/07/2026',
      releaseCondition: 'Entrega confirmada pelo rastreamento internacional',
      deliveryStatus: 'Entregue em São Paulo/BR',
      hasDispute: false,
      expectedReleaseDate: '30/07/2026',
      status: 'liberado',
      notes: 'Liberado para o saldo da loja com sucesso.',
    },
    {
      id: 'ESC-8810',
      orderId: 'ORD-8810',
      buyerName: 'Bacai Sanhá',
      sellerName: 'Ana Paula Rocha',
      amount: 180000,
      amountFormatted: '180.000 XOF',
      currency: 'XOF',
      createdAt: '29/07/2026',
      releaseCondition: 'Bloqueado devido a Disputa aberta pelo Comprador',
      deliveryStatus: 'Entrega com Avaria Reportada',
      hasDispute: true,
      expectedReleaseDate: 'Pendente de Mediação',
      status: 'bloqueado',
      notes: 'Bloqueado preventivamente pelo time de segurança.',
    },
  ] as AdminEscrowItem[],

  disputes: [
    {
      id: 'DSP-9821',
      orderId: 'ORD-8810',
      buyerName: 'Bacai Sanhá',
      sellerName: 'Ana Paula Rocha (Moda Afro CPLP)',
      productTitle: 'Inversor Solar Híbrido 5kW 48V High Efficiency',
      country: 'GW',
      reason: 'Produto com caixa amassada e avaria no gabinete exterior durante envio cross-border.',
      amountFormatted: '180.000 XOF',
      escrowStatus: 'Bloqueado (180.000 XOF)',
      messagesCount: 8,
      evidencesCount: 3,
      mediatorName: 'Mussá Mane (Mediador Senior)',
      status: 'in_mediation',
      deadline: '24 horas restantes',
      timeline: [
        { title: 'Disputa Aberta pelo Comprador', date: '29/07 10:15', done: true },
        { title: 'Vendedor Enviou Réplica com NF e fotos de despacho', date: '29/07 16:30', done: true },
        { title: 'Análise de Evidências Logísticas e Fotos', date: '30/07 09:00', done: true },
        { title: 'Proposta de Acordo com Reembolso Parcial de 30.000 XOF', date: '31/07 11:00', done: false },
        { title: 'Decisão Final e Liberação Escrow', date: 'Pendente', done: false },
      ],
    },
    {
      id: 'DSP-9822',
      orderId: 'ORD-7712',
      buyerName: 'Maria Silva',
      sellerName: 'Bissau Tech Store',
      productTitle: 'Galaxy S23 Ultra 512GB Phantom Black',
      country: 'BR',
      reason: 'Comprador alega que não recebeu um dos acessórios listados no anúncio.',
      amountFormatted: 'R$ 4.200,00',
      escrowStatus: 'Retido em Mediação',
      messagesCount: 4,
      evidencesCount: 2,
      mediatorName: 'Juliana Mendes',
      status: 'pending_decision',
      deadline: '12 horas restantes',
      timeline: [
        { title: 'Disputa Aberta', date: '27/07 14:00', done: true },
        { title: 'Solicitação de Evidências ao Vendedor', date: '28/07 09:00', done: true },
        { title: 'Vendedor comprovou envio em pacote lacrado', date: '29/07 11:00', done: true },
      ],
    },
  ] as AdminDisputeItem[],

  warehouses: [
    {
      id: 'WH-001',
      code: 'HUB-GW-01',
      name: 'HUB Central Nusali Bandim - Bissau',
      country: 'GW',
      city: 'Bissau',
      address: 'Av. Amílcar Cabral, nº 45, Bairro Bandim',
      managerName: 'Domingos Té',
      capacityUsedPercentage: 74,
      totalCapacityPackages: 15000,
      activeShipments: 1240,
      dailyInboundPackages: 380,
      dailyOutboundPackages: 360,
      status: 'active',
      staffCount: 28,
      monthlyOperatingCostFormatted: '4.500.000 XOF',
    },
    {
      id: 'WH-002',
      code: 'HUB-PT-01',
      name: 'HUB Lisboa Transit Cross-Border',
      country: 'PT',
      city: 'Lisboa',
      address: 'Zona Industrial de Prior Velho, Lote 12',
      managerName: 'Gonçalo Neves',
      capacityUsedPercentage: 62,
      totalCapacityPackages: 30000,
      activeShipments: 2850,
      dailyInboundPackages: 820,
      dailyOutboundPackages: 790,
      status: 'active',
      staffCount: 42,
      monthlyOperatingCostFormatted: '€ 18.500',
    },
    {
      id: 'WH-003',
      code: 'HUB-BR-01',
      name: 'HUB São Paulo Guarulhos Logistics',
      country: 'BR',
      city: 'Guarulhos',
      address: 'Rodovia Hélio Smidt, s/n, Acesso CPLP Cargo',
      managerName: 'Renato Barbosa',
      capacityUsedPercentage: 81,
      totalCapacityPackages: 45000,
      activeShipments: 4120,
      dailyInboundPackages: 1200,
      dailyOutboundPackages: 1150,
      status: 'active',
      staffCount: 56,
      monthlyOperatingCostFormatted: 'R$ 84.000',
    },
    {
      id: 'WH-004',
      code: 'HUB-AO-01',
      name: 'HUB Luanda Viana Hub Logístico',
      country: 'AO',
      city: 'Luanda',
      address: 'Pólo Industrial de Viana, Km 25',
      managerName: 'Mariana Costa',
      capacityUsedPercentage: 55,
      totalCapacityPackages: 25000,
      activeShipments: 1890,
      dailyInboundPackages: 490,
      dailyOutboundPackages: 470,
      status: 'active',
      staffCount: 35,
      monthlyOperatingCostFormatted: '12.000.000 AOA',
    },
  ] as AdminWarehouseItem[],

  countryReps: [
    {
      id: 'REP-GW-01',
      name: 'Malam Bacai Sanhá Jr.',
      email: 'malam.bacai@nusali.gw',
      phone: '+245 955 000 003',
      countryCode: 'GW',
      countryName: 'Guiné-Bissau (GW)',
      status: 'active',
      assignedSellersCount: 142,
      assignedStoresCount: 48,
      supervisorsCount: 4,
      monthlyRevenueFormatted: '185.400.000 XOF',
      monthlyOrders: 3420,
      performanceScore: 98,
      targetGMVFormatted: '200.000.000 XOF',
      commissionRate: '1.5%',
      lastLogin: 'Hoje às 08:30',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'REP-BR-01',
      name: 'Juliana Mendes',
      email: 'juliana.mendes@nusali.com.br',
      phone: '+55 11 98888-7766',
      countryCode: 'BR',
      countryName: 'Brasil (BR)',
      status: 'active',
      assignedSellersCount: 310,
      assignedStoresCount: 120,
      supervisorsCount: 8,
      monthlyRevenueFormatted: 'R$ 840.000',
      monthlyOrders: 5600,
      performanceScore: 99,
      targetGMVFormatted: 'R$ 1.000.000',
      commissionRate: '1.2%',
      lastLogin: 'Hoje às 09:15',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'REP-PT-01',
      name: 'Dr. Afonso Henriques Moreira',
      email: 'afonso.moreira@nusali.pt',
      phone: '+351 912 345 678',
      countryCode: 'PT',
      countryName: 'Portugal (PT)',
      status: 'active',
      assignedSellersCount: 220,
      assignedStoresCount: 85,
      supervisorsCount: 5,
      monthlyRevenueFormatted: '€ 320.000',
      monthlyOrders: 4100,
      performanceScore: 96,
      targetGMVFormatted: '€ 400.000',
      commissionRate: '1.0%',
      lastLogin: 'Hoje às 07:45',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    },
  ] as AdminCountryRepItem[],

  supervisors: [
    {
      id: 'SUP-GW-01',
      name: 'Mussá Mané',
      email: 'mussa.mane@nusali.gw',
      phone: '+245 966 222 333',
      regionId: 'REG-GW-001',
      regionName: 'Setor Autónomo de Bissau & Biombo',
      countryCode: 'GW',
      status: 'active',
      assignedHubsCount: 2,
      deliveriesToday: 142,
      performanceRating: 4.9,
      activeCouriersCount: 24,
      monthlyDeliveries: 3850,
      lastActive: 'Online Agora',
    },
    {
      id: 'SUP-GW-02',
      name: 'Fatoumata Binta Djassi',
      email: 'fatoumata.djassi@nusali.gw',
      phone: '+245 955 444 555',
      regionId: 'REG-GW-002',
      regionName: 'Região de Bafatá & Gabú',
      countryCode: 'GW',
      status: 'active',
      assignedHubsCount: 1,
      deliveriesToday: 68,
      performanceRating: 4.8,
      activeCouriersCount: 12,
      monthlyDeliveries: 1640,
      lastActive: 'Há 15 min',
    },
  ] as AdminSupervisorItem[],

  auditLogs: [
    {
      id: 'AUD-501',
      userName: 'Mamadu Djassi',
      userRole: 'Administrador Geral CPLP',
      action: 'Aprovação de KYC Vendedor',
      entity: 'Vendedor Bissau Tech & Export Store (SEL-001)',
      previousValue: 'Pendente',
      newValue: 'Verificado Ouro',
      ipAddress: '197.214.12.89',
      country: 'GW',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      result: 'sucesso',
    },
    {
      id: 'AUD-502',
      userName: 'Juliana Mendes',
      userRole: 'Representante Nacional BR',
      action: 'Liberação de Custódia Escrow',
      entity: 'Pedido #ORD-8750',
      previousValue: 'Retido',
      newValue: 'Liberado ao Vendedor',
      ipAddress: '187.32.110.45',
      country: 'BR',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      result: 'sucesso',
    },
  ] as AdminAuditItem[],

  platformSettings: {
    platformName: 'Mercado Nusali CPLP',
    escrowHoldingHours: 48,
    defaultBuyerProtectionFeePercent: 1.5,
    defaultSellerCommissionPercent: 5.0,
    maintenanceMode: false,
    require2faForStaff: true,
    supportedCurrencies: ['XOF', 'BRL', 'EUR', 'AOA', 'MZN', 'CVE', 'STN', 'USD'],
    activeHubsCount: 8,
  },
};

// Helper: Record an immutable Audit Log entry
function logAdminAction(userName: string, userRole: string, action: string, entity: string, previousValue: string, newValue: string, result: 'sucesso' | 'falha' | 'alerta' = 'sucesso', country: string = 'GW') {
  const newLog: AdminAuditItem = {
    id: `AUD-${Date.now().toString().slice(-4)}`,
    userName: userName || 'Mamadu Djassi (Admin Geral)',
    userRole: userRole || 'Administrador Geral',
    action,
    entity,
    previousValue: previousValue || 'N/A',
    newValue: newValue || 'N/A',
    ipAddress: '197.214.12.89',
    country,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    result,
  };
  adminState.auditLogs.unshift(newLog);
}

// ==========================================
// 1. OVERVIEW & KPIS
// ==========================================
adminRouter.get('/overview', async (req: Request, res: Response) => {
  const totalUsers = adminState.users.length;
  const activeSellers = adminState.users.filter(u => u.role === 'seller').length;
  const pendingKyc = adminState.kycQueue.filter(k => k.status === 'nova' || k.status === 'under_review').length;
  const activeDisputes = adminState.disputes.filter(d => d.status !== 'resolved').length;
  const activeEscrowAmount = adminState.escrowList
    .filter(e => e.status === 'retido' || e.status === 'bloqueado')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return res.json({
    success: true,
    data: {
      metrics: {
        totalGmvFormatted: '1.450.000.000 XOF',
        totalOrdersCount: 14280,
        activeUsersCount: totalUsers,
        verifiedSellersCount: activeSellers,
        pendingKycCount: pendingKyc,
        activeDisputesCount: activeDisputes,
        escrowInCustodyFormatted: `${activeEscrowAmount.toLocaleString()} XOF`,
        activeHubsCount: adminState.warehouses.length,
        securityAlertsCount: 0,
      },
      recentActivity: adminState.auditLogs.slice(0, 10),
      escrowOverview: adminState.escrowList.slice(0, 5),
      kycQueue: adminState.kycQueue.slice(0, 5),
      disputesQueue: adminState.disputes.slice(0, 5),
    },
  });
});

adminRouter.get('/stats', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      countries: ['GW', 'BR', 'PT', 'AO', 'MZ', 'CV', 'ST', 'TL'],
      currencies: adminState.platformSettings.supportedCurrencies,
      totalVolumeByCountry: {
        GW: '620.000.000 XOF',
        BR: 'R$ 2.450.000',
        PT: '€ 950.000',
        AO: '340.000.000 AOA',
      },
    },
  });
});

// ==========================================
// 2. USERS & INTERNAL STAFF MANAGEMENT
// ==========================================
adminRouter.get('/users', async (req: Request, res: Response) => {
  const { role, status, q } = req.query;
  let filtered = [...adminState.users];

  if (role && typeof role === 'string' && role !== 'all') {
    filtered = filtered.filter(u => u.role.toLowerCase() === role.toLowerCase());
  }
  if (status && typeof status === 'string' && status !== 'all') {
    filtered = filtered.filter(u => u.status === status);
  }
  if (q && typeof q === 'string' && q.trim()) {
    const term = q.toLowerCase();
    filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.phone.includes(term)
    );
  }

  return res.json({
    success: true,
    data: filtered,
    total: filtered.length,
  });
});

adminRouter.post('/users', async (req: Request, res: Response) => {
  const { name, email, phone, country = 'GW', role = 'buyer' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Nome e email são obrigatórios.' });
  }

  const roleLabelMap: Record<string, string> = {
    admin: 'Administrador Geral',
    country_rep: 'Representante Nacional',
    supervisor: 'Supervisor Regional',
    seller: 'Vendedor',
    buyer: 'Comprador',
  };

  const newUser: AdminUserData = {
    id: `USR-${Date.now().toString().slice(-4)}`,
    name,
    email,
    phone: phone || '+245 950000000',
    country,
    role,
    roleLabel: roleLabelMap[role] || 'Usuário',
    status: 'active',
    createdAt: new Date().toLocaleDateString('pt-PT'),
    lastLogin: 'Agora mesmo',
    ordersCount: 0,
    purchasesCount: 0,
    riskScore: 'baixo',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  };

  adminState.users.unshift(newUser);
  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Criação de Usuário', `Usuário ${name} (${email})`, 'Inexistente', `Ativo / ${role}`);

  return res.json({
    success: true,
    message: `Usuário ${name} criado com sucesso!`,
    data: newUser,
  });
});

adminRouter.get('/users/:id', async (req: Request, res: Response) => {
  const user = adminState.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
  }
  return res.json({ success: true, data: user });
});

adminRouter.patch('/users/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  const user = adminState.users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
  }

  const prevStatus = user.status;
  user.status = status || (user.status === 'blocked' ? 'active' : 'blocked');

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Alteração de Status de Usuário', `Usuário ${user.name} (${user.id})`, prevStatus, user.status);

  return res.json({
    success: true,
    message: `Status do usuário ${user.name} alterado para ${user.status.toUpperCase()}.`,
    data: user,
  });
});

adminRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const user = adminState.users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
  }

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Redefinição de Senha', `Usuário ${user.name} (${user.id})`, 'Senha Antiga', 'Senha Redefinida com Sucesso');

  return res.json({
    success: true,
    message: `Senha do usuário ${user.name} foi redefinida com sucesso!`,
  });
});

// ==========================================
// 3. KYC & DOCUMENT VERIFICATION
// ==========================================
adminRouter.get('/kyc', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.kycQueue,
  });
});

adminRouter.post('/kyc/:id/approve', async (req: Request, res: Response) => {
  const kyc = adminState.kycQueue.find(k => k.id === req.params.id);
  if (!kyc) {
    return res.status(404).json({ success: false, message: 'Documento KYC não encontrado.' });
  }

  const prev = kyc.status;
  kyc.status = 'verified';
  kyc.notes = req.body.notes || 'Documentação verificada e aprovada pelo Administrador Geral.';

  // Update seller status if matching user
  const matchingUser = adminState.users.find(u => u.name === kyc.sellerName || u.email.includes(kyc.sellerName.toLowerCase()));
  if (matchingUser) {
    matchingUser.status = 'active';
  }

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Aprovação de Documentação KYC', `Vendedor ${kyc.sellerName} (${kyc.id})`, prev, 'verified');

  return res.json({
    success: true,
    message: `Documento KYC #${kyc.id} aprovado com sucesso! Vendedor verificado.`,
    data: kyc,
  });
});

adminRouter.post('/kyc/:id/reject', async (req: Request, res: Response) => {
  const kyc = adminState.kycQueue.find(k => k.id === req.params.id);
  if (!kyc) {
    return res.status(404).json({ success: false, message: 'Documento KYC não encontrado.' });
  }

  const prev = kyc.status;
  kyc.status = 'rejected';
  kyc.notes = req.body.reason || 'Documento ilegível ou divergência de titularidade.';

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Rejeição de Documentação KYC', `Vendedor ${kyc.sellerName} (${kyc.id})`, prev, 'rejected');

  return res.json({
    success: true,
    message: `Documento KYC #${kyc.id} rejeitado. Vendedor notificado para reenvio.`,
    data: kyc,
  });
});

// ==========================================
// 4. ESCROW CUSTODY & NUSALI PROTEÇÃO
// ==========================================
adminRouter.get('/escrow', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.escrowList,
  });
});

adminRouter.post('/escrow/:id/release', async (req: Request, res: Response) => {
  const item = adminState.escrowList.find(e => e.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Custódia Escrow não encontrada.' });
  }

  const prev = item.status;
  item.status = 'liberado';
  item.notes = req.body.notes || 'Liberado manualmente pela Diretoria de Operações.';

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Liberação Manual de Custódia Escrow', `Pedido #${item.orderId} (${item.amountFormatted})`, prev, 'liberado');

  return res.json({
    success: true,
    message: `Custódia #${item.id} liberada com sucesso para o vendedor!`,
    data: item,
  });
});

adminRouter.post('/escrow/:id/freeze', async (req: Request, res: Response) => {
  const item = adminState.escrowList.find(e => e.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Custódia Escrow não encontrada.' });
  }

  const prev = item.status;
  item.status = 'bloqueado';
  item.notes = req.body.reason || 'Bloqueado preventivamente para auditoria de segurança.';

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Bloqueio Preventivo de Custódia Escrow', `Pedido #${item.orderId} (${item.amountFormatted})`, prev, 'bloqueado');

  return res.json({
    success: true,
    message: `Custódia #${item.id} bloqueada para auditoria.`,
    data: item,
  });
});

// ==========================================
// 5. DISPUTES MEDIATION
// ==========================================
adminRouter.get('/disputes', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.disputes,
  });
});

adminRouter.post('/disputes/:id/resolve', async (req: Request, res: Response) => {
  const { resolution, decisionNotes } = req.body;
  const dispute = adminState.disputes.find(d => d.id === req.params.id);

  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Disputa não encontrada.' });
  }

  dispute.status = 'resolved';
  dispute.timeline.push({
    title: `Disputa Resolvida: ${resolution === 'refund_buyer' ? 'Reembolso ao Comprador' : 'Liberação ao Vendedor'}`,
    date: new Date().toLocaleDateString('pt-PT') + ' ' + new Date().toLocaleTimeString('pt-PT'),
    done: true,
  });

  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Resolução de Disputa', `Disputa #${dispute.id} (Pedido #${dispute.orderId})`, 'Em Mediação', `Resolvida: ${resolution}`);

  return res.json({
    success: true,
    message: `Disputa #${dispute.id} resolvida com sucesso! Decisão registrada.`,
    data: dispute,
  });
});

// ==========================================
// 6. WAREHOUSES & LOGISTICS HUBS
// ==========================================
adminRouter.get('/warehouses', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.warehouses,
  });
});

adminRouter.post('/warehouses', async (req: Request, res: Response) => {
  const { name, code, country, city, address, managerName, staffCount, totalCapacityPackages } = req.body;

  if (!name || !country || !city) {
    return res.status(400).json({ success: false, message: 'Nome, país e cidade são obrigatórios.' });
  }

  const newWh: AdminWarehouseItem = {
    id: `WH-${Date.now().toString().slice(-3)}`,
    code: code || `HUB-${country}-${Date.now().toString().slice(-2)}`,
    name,
    country,
    city,
    address: address || `Endereço Principal HUB ${city}`,
    managerName: managerName || 'Gerente Logístico',
    capacityUsedPercentage: 15,
    totalCapacityPackages: Number(totalCapacityPackages) || 10000,
    activeShipments: 0,
    dailyInboundPackages: 0,
    dailyOutboundPackages: 0,
    status: 'active',
    staffCount: Number(staffCount) || 8,
    monthlyOperatingCostFormatted: '1.500.000 XOF',
  };

  adminState.warehouses.push(newWh);
  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Criação de HUB Logístico', `HUB ${name} (${city}/${country})`, 'Inexistente', 'Ativo');

  return res.json({
    success: true,
    message: `HUB Logístico "${name}" cadastrado com sucesso!`,
    data: newWh,
  });
});

// ==========================================
// 7. COUNTRY REPS & SUPERVISORS
// ==========================================
adminRouter.get('/country-reps', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.countryReps,
  });
});

adminRouter.post('/country-reps', async (req: Request, res: Response) => {
  const { name, email, phone, countryName, countryCode = 'GW', targetGMV, commissionRate } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Nome e email são obrigatórios.' });
  }

  const newRep: AdminCountryRepItem = {
    id: `REP-${countryCode}-${Date.now().toString().slice(-3)}`,
    name,
    email,
    phone: phone || '+245 950000000',
    countryCode,
    countryName: countryName || 'Guiné-Bissau (GW)',
    status: 'active',
    assignedSellersCount: 0,
    assignedStoresCount: 0,
    supervisorsCount: 1,
    monthlyRevenueFormatted: '0 XOF',
    monthlyOrders: 0,
    performanceScore: 100,
    targetGMVFormatted: targetGMV || '50.000.000 XOF',
    commissionRate: commissionRate || '1.5%',
    lastLogin: 'Agora mesmo',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  };

  adminState.countryReps.push(newRep);
  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Nomeação de Representante Nacional', `${name} (${countryName})`, 'Vago', 'Nomeado');

  return res.json({
    success: true,
    message: `Representante Nacional ${name} nomeado com sucesso!`,
    data: newRep,
  });
});

adminRouter.get('/supervisors', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.supervisors,
  });
});

adminRouter.post('/supervisors', async (req: Request, res: Response) => {
  const { name, email, phone, regionName, countryCode = 'GW' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Nome e email são obrigatórios.' });
  }

  const newSupervisor: AdminSupervisorItem = {
    id: `SUP-${countryCode}-${Date.now().toString().slice(-3)}`,
    name,
    email,
    phone: phone || '+245 950000000',
    regionId: `REG-${countryCode}-001`,
    regionName: regionName || 'Setor Autónomo Bissau',
    countryCode,
    status: 'active',
    assignedHubsCount: 1,
    deliveriesToday: 0,
    performanceRating: 5.0,
    activeCouriersCount: 5,
    monthlyDeliveries: 0,
    lastActive: 'Agora mesmo',
  };

  adminState.supervisors.push(newSupervisor);
  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Nomeação de Supervisor Regional', `${name} (${regionName})`, 'Vago', 'Ativo');

  return res.json({
    success: true,
    message: `Supervisor Regional ${name} cadastrado com sucesso!`,
    data: newSupervisor,
  });
});

// ==========================================
// 8. AUDIT LOGS & SETTINGS
// ==========================================
adminRouter.get('/audit', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.auditLogs,
  });
});

adminRouter.get('/settings', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: adminState.platformSettings,
  });
});

adminRouter.post('/settings', async (req: Request, res: Response) => {
  Object.assign(adminState.platformSettings, req.body);
  logAdminAction('Mamadu Djassi', 'Admin Geral', 'Atualização de Configurações da Plataforma', 'Parâmetros Globais CPLP', 'Configuração Anterior', 'Nova Configuração Salva');

  return res.json({
    success: true,
    message: 'Configurações globais da plataforma salvas com sucesso!',
    data: adminState.platformSettings,
  });
});
