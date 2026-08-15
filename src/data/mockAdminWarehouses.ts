export interface WarehouseRecord {
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

export const mockWarehousesList: WarehouseRecord[] = [
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
    monthlyOperatingCostFormatted: '4.500.000 XOF'
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
    monthlyOperatingCostFormatted: '€ 18.500'
  },
  {
    id: 'WH-003',
    code: 'HUB-BR-01',
    name: 'HUB São Paulo Guarulhos Logistics',
    country: 'BR',
    city: 'Guarulhos',
    address: 'Rodovia Hélio Smidt, s/n, Acesso CPLP Cargo',
    managerName: 'Marcelo Camargo',
    capacityUsedPercentage: 81,
    totalCapacityPackages: 50000,
    activeShipments: 5400,
    dailyInboundPackages: 1400,
    dailyOutboundPackages: 1350,
    status: 'active',
    staffCount: 65,
    monthlyOperatingCostFormatted: 'R$ 85.000'
  },
  {
    id: 'WH-004',
    code: 'HUB-AO-01',
    name: 'HUB Luanda Viana Logistics',
    country: 'AO',
    city: 'Luanda',
    address: 'Zona Industrial de Viana, Rua da Estação 8',
    managerName: 'António Domingos',
    capacityUsedPercentage: 55,
    totalCapacityPackages: 20000,
    activeShipments: 1100,
    dailyInboundPackages: 310,
    dailyOutboundPackages: 290,
    status: 'active',
    staffCount: 22,
    monthlyOperatingCostFormatted: '12.000.000 Kz'
  }
];
