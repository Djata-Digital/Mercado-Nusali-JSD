export interface AdminSellerRecord {
  id: string;
  name: string;
  companyName: string;
  country: string;
  sellerType: 'pf' | 'pj' | 'official_store' | 'cross_border';
  storesCount: number;
  productsCount: number;
  ordersCount: number;
  totalSalesFormatted: string;
  reputationLevel: 'Líder Ouro' | 'Líder Prata' | 'Verificado' | 'Em Análise' | 'Sem Reputação';
  kycStatus: 'verified' | 'pending' | 'under_review' | 'rejected';
  riskScore: 'baixo' | 'medio' | 'alto';
  status: 'active' | 'suspended' | 'under_review' | 'rejected';
  nifTaxId: string;
}

export const mockAdminSellersList: AdminSellerRecord[] = [
  {
    id: 'SEL-001',
    name: 'Carlos Biai',
    companyName: 'Bissau Tech Store',
    country: 'GW',
    sellerType: 'pj',
    storesCount: 2,
    productsCount: 48,
    ordersCount: 420,
    totalSalesFormatted: '38.500.000 XOF',
    reputationLevel: 'Líder Ouro',
    kycStatus: 'verified',
    riskScore: 'baixo',
    status: 'active',
    nifTaxId: 'NIF-982109482'
  },
  {
    id: 'SEL-002',
    name: 'Sene Biai',
    companyName: 'Soluções Agrícolas Lda',
    country: 'GW',
    sellerType: 'official_store',
    storesCount: 1,
    productsCount: 35,
    ordersCount: 1250,
    totalSalesFormatted: '124.000.000 XOF',
    reputationLevel: 'Líder Ouro',
    kycStatus: 'verified',
    riskScore: 'baixo',
    status: 'active',
    nifTaxId: 'NIF-77123901'
  },
  {
    id: 'SEL-003',
    name: 'Ana Paula Rocha',
    companyName: 'Moda Afro CPLP BR',
    country: 'BR',
    sellerType: 'cross_border',
    storesCount: 1,
    productsCount: 82,
    ordersCount: 310,
    totalSalesFormatted: 'R$ 185.000,00',
    reputationLevel: 'Líder Prata',
    kycStatus: 'verified',
    riskScore: 'baixo',
    status: 'active',
    nifTaxId: 'CNPJ 12.345.678/0001-90'
  },
  {
    id: 'SEL-004',
    name: 'Bacai Sanhá',
    companyName: 'Energia Solar Bissau',
    country: 'GW',
    sellerType: 'pj',
    storesCount: 1,
    productsCount: 18,
    ordersCount: 95,
    totalSalesFormatted: '22.800.000 XOF',
    reputationLevel: 'Verificado',
    kycStatus: 'under_review',
    riskScore: 'medio',
    status: 'under_review',
    nifTaxId: 'NIF-55210981'
  },
  {
    id: 'SEL-005',
    name: 'EletroBissau Ltda',
    companyName: 'EletroBissau Comercial',
    country: 'GW',
    sellerType: 'pj',
    storesCount: 1,
    productsCount: 6,
    ordersCount: 0,
    totalSalesFormatted: '0 XOF',
    reputationLevel: 'Sem Reputação',
    kycStatus: 'pending',
    riskScore: 'baixo',
    status: 'under_review',
    nifTaxId: 'NIF-11002233'
  },
  {
    id: 'SEL-006',
    name: 'Importadora Caxito',
    companyName: 'Caxito Vendas',
    country: 'AO',
    sellerType: 'pj',
    storesCount: 1,
    productsCount: 14,
    ordersCount: 18,
    totalSalesFormatted: '2.400.000 Kz',
    reputationLevel: 'Em Análise',
    kycStatus: 'rejected',
    riskScore: 'alto',
    status: 'suspended',
    nifTaxId: 'NIF-AO-992102'
  }
];
