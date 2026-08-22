export interface CountryConfigData {
  id: string;
  name: string;
  flag: string;
  codeISO: string;
  phoneCode: string;
  currency: string;
  currencySymbol: string;
  language: string;
  timezone: string;
  status: 'active' | 'inactive' | 'expansion';
  representative: string;
  regionsCount: number;
  citiesCount: number;
  mainWarehouse?: string;
  paymentMethods: string[];
  carriers: string[];
  taxRate: string;
  customsDuty: string;
  operationLimits: string;
  commissionRate: string;
  policies: string[];
}

export const mockCountriesList: CountryConfigData[] = [
  {
    id: 'GW',
    name: 'Guiné-Bissau',
    flag: '🇬🇼',
    codeISO: 'GWB',
    phoneCode: '+245',
    currency: 'XOF',
    currencySymbol: 'FCFA',
    language: 'Português / Kriol',
    timezone: 'GMT (UTC+0)',
    status: 'active',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    mainWarehouse: 'HUB Central Bandim - Bissau',
    paymentMethods: ['Orange Money', 'MTN Mobile Money', 'Transferência Bancária BAO', 'Nusali Pay'],
    carriers: ['Nusali Logística Bissau', 'Guiné Express', 'Transporte Fluvial Bijagós'],
    taxRate: '15% IGV',
    customsDuty: '0% (Isenção EcoWAS CPLP)',
    operationLimits: '10.000.000 XOF/mês',
    commissionRate: '4.5%',
    policies: ['Garantia de Devolução 7 Dias', 'Entrega Expressa Bissau 24h', 'Suporte Local']
  },
  {
    id: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    codeISO: 'BRA',
    phoneCode: '+55',
    currency: 'BRL',
    currencySymbol: 'R$',
    language: 'Português',
    timezone: 'BRT (UTC-3)',
    status: 'active',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    paymentMethods: ['PIX', 'Cartão de Crédito até 12x', 'Boleto Bancário', 'Nusali Pay'],
    carriers: ['Nusali Logística BR', 'Correios', 'J&T Express', 'Loggi'],
    taxRate: '17% ICMS / ISS',
    customsDuty: '60% (Acordo CPLP Isenção Simplificada)',
    operationLimits: 'R$ 500.000/mês',
    commissionRate: '5.0%',
    policies: ['Código de Defesa do Consumidor', 'Devolução Grátis 30 Dias']
  },
  {
    id: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    codeISO: 'PRT',
    phoneCode: '+351',
    currency: 'EUR',
    currencySymbol: '€',
    language: 'Português',
    timezone: 'WET (UTC+0)',
    status: 'active',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    paymentMethods: ['MB WAY', 'Multibanco', 'Cartão de Crédito SEPA', 'Nusali Pay'],
    carriers: ['Nusali Hub Lisboa', 'CTT Correios de Portugal', 'DPD Portugal'],
    taxRate: '23% IVA',
    customsDuty: 'Tarifa Comunitária UE',
    operationLimits: '€ 100.000/mês',
    commissionRate: '4.0%',
    policies: ['Direito de Livre Resolução UE 14 dias', 'Garantia de 3 anos']
  },
  {
    id: 'AO',
    name: 'Angola',
    flag: '🇦🇴',
    codeISO: 'AGO',
    phoneCode: '+244',
    currency: 'AOA',
    currencySymbol: 'Kz',
    language: 'Português',
    timezone: 'WAT (UTC+1)',
    status: 'active',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    paymentMethods: ['Multicaixa Express', 'Transferência Bancária BAI', 'Nusali Pay'],
    carriers: ['Nusali Logística Luanda', 'Macon Express', 'Angola Post'],
    taxRate: '14% IVA',
    customsDuty: '5% Simplificado',
    operationLimits: '50.000.000 Kz/mês',
    commissionRate: '4.8%',
    policies: ['Garantia 15 Dias', 'Entrega Luanda 48h']
  },
  {
    id: 'CV',
    name: 'Cabo Verde',
    flag: '🇨🇻',
    codeISO: 'CPV',
    phoneCode: '+238',
    currency: 'CVE',
    currencySymbol: '$',
    language: 'Português / Crioulo',
    timezone: 'CVT (UTC-1)',
    status: 'expansion',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    paymentMethods: ['Vinti4', 'MB WAY CV', 'Nusali Pay'],
    carriers: ['Correios de Cabo Verde', 'Transporte Marítimo Inter-Ilhas'],
    taxRate: '15% IVA',
    customsDuty: '2% Preferencial CPLP',
    operationLimits: '10.000.000 CVE/mês',
    commissionRate: '4.5%',
    policies: ['Atendimento Inter-Ilhas']
  },
  {
    id: 'MZ',
    name: 'Moçambique',
    flag: '🇲🇿',
    codeISO: 'MOZ',
    phoneCode: '+258',
    currency: 'MZN',
    currencySymbol: 'MT',
    language: 'Português',
    timezone: 'CAT (UTC+2)',
    status: 'expansion',
    representative: 'Pendente de Nomeação',
    regionsCount: 0,
    citiesCount: 0,
    paymentMethods: ['M-Pesa', 'e-Mola', 'SIMO Rede', 'Nusali Pay'],
    carriers: ['Correios de Moçambique', 'Portos e Caminhos de Ferro'],
    taxRate: '16% IVA',
    customsDuty: '5% Padrão',
    operationLimits: '20.000.000 MT/mês',
    commissionRate: '4.5%',
    policies: ['Suporte Regional Maputo']
  }
];
