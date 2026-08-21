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

export const mockRegionsList: RegionData[] = [];
