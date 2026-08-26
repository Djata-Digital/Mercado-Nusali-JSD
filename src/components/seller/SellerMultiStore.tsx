import React, { useState, useEffect } from 'react';
import {
  Store,
  PlusCircle,
  Edit2,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Shield,
  X,
  Save,
  Upload,
  Loader2,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { isSellerKycApproved } from '../../utils/kycUtils';
import { SellerStoreData, SellerProfileData } from '../../data/mockSellerData';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { useCountries } from '../../hooks/useCountries';
import { uploadService } from '../../services/uploadService';
import { apiClient } from '../../api/apiClient';

interface SellerMultiStoreProps {
  stores: SellerStoreData[];
  profile?: SellerProfileData;
  selectedStoreId: string;
  onSelectStore: (id: string) => void;
  onAddStore: (store: SellerStoreData) => void;
  onUpdateStore: (store: SellerStoreData) => void;
  showToast: (msg: string) => void;
  openPublicStoreView?: (slug: string) => void;
}

interface CategoryItem {
  id: string;
  name: string;
  isActive?: boolean;
}

interface DaySchedule {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

interface BusinessHoursState {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

const initialBusinessHours = (): BusinessHoursState => ({
  monday: { isOpen: false, openTime: '', closeTime: '' },
  tuesday: { isOpen: false, openTime: '', closeTime: '' },
  wednesday: { isOpen: false, openTime: '', closeTime: '' },
  thursday: { isOpen: false, openTime: '', closeTime: '' },
  friday: { isOpen: false, openTime: '', closeTime: '' },
  saturday: { isOpen: false, openTime: '', closeTime: '' },
  sunday: { isOpen: false, openTime: '', closeTime: '' },
});

export const SellerMultiStore: React.FC<SellerMultiStoreProps> = ({
  stores,
  profile,
  selectedStoreId,
  onSelectStore,
  onAddStore,
  onUpdateStore,
  showToast,
  openPublicStoreView,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<SellerStoreData | null>(null);

  // Dynamic Categories from Backend
  const [categoriesList, setCategoriesList] = useState<CategoryItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const isKycOk = isSellerKycApproved(profile?.kycStatus);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        setCategoryError(null);

        const res = await apiClient.get<any>('/catalog/categories');
        const rawList = Array.isArray(res?.data) ? res.data : Array.isArray((res as any)?.categories) ? (res as any).categories : [];

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[CATEGORIES] endpoint: /catalog/categories status HTTP: 200 count recebido: ${rawList.length}`);
        }

        const active = rawList.filter((c: any) => c.status === 'active' || c.isActive !== false);

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[CATEGORIES] count após filtro: ${active.length}`);
        }

        setCategoriesList(active);
      } catch (err: any) {
        console.error('[CATEGORIES] Failed to load catalog categories:', err);
        setCategoriesList([]);
        setCategoryError('Não foi possível carregar as categorias.');
      } finally {
        setIsLoadingCategories(false);
      }
    };
    loadCategories();
  }, []);

  // Form State (Defaulting cleanly to EMPTY - no fake/demo fallbacks)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  // Sem fallback fixo para GW: parte do país real do próprio vendedor
  // quando disponível; vazio até os países operacionais carregarem, caso não.
  const [country, setCountry] = useState<CountryCode>(profile?.country || '');
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logo, setLogo] = useState('');
  const [banner, setBanner] = useState('');
  const [businessHours, setBusinessHours] = useState<BusinessHoursState>(initialBusinessHours());

  // Uploading state
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const handleOpenCreateModal = () => {
    setEditingStore(null);
    setName('');
    setDescription('');
    setSelectedCategoryId(categoriesList.length > 0 ? categoriesList[0].id : '');
    setCountry('GW');
    setCity('');
    setAddress('');
    setPhone('');
    setEmail('');
    setLogo('');
    setBanner('');
    setBusinessHours(initialBusinessHours());
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (store: SellerStoreData) => {
    setEditingStore(store);
    setName(store.name || '');
    setDescription(store.description || '');
    setSelectedCategoryId(store.categoryId || (categoriesList.length > 0 ? categoriesList[0].id : ''));
    setCountry(store.country || 'GW');
    setCity(store.city || '');
    setAddress(store.address || '');
    setPhone(store.phone || '');
    setEmail(store.email || '');
    setLogo(store.logo || '');
    setBanner(store.banner || '');
    if (store.businessHoursJson && typeof store.businessHoursJson === 'object') {
      setBusinessHours(store.businessHoursJson);
    } else {
      setBusinessHours(initialBusinessHours());
    }
    setIsModalOpen(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Formato de imagem inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('O logo deve ter no máximo 5 MB.');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const res = await uploadService.uploadStore(file);
      setLogo(res.url);
      showToast('Logo da loja enviado com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Formato de imagem inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('O banner deve ter no máximo 10 MB.');
      return;
    }

    setIsUploadingBanner(true);
    try {
      const res = await uploadService.uploadStore(file);
      setBanner(res.url);
      showToast('Banner da loja enviado com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar banner.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const updateDaySchedule = (dayKey: keyof BusinessHoursState, field: keyof DaySchedule, value: any) => {
    setBusinessHours((prev) => {
      const currentDay = prev[dayKey];
      const isOpening = field === 'isOpen' && value === true;
      return {
        ...prev,
        [dayKey]: {
          ...currentDay,
          [field]: value,
          openTime: isOpening && !currentDay.openTime ? '08:00' : (field === 'isOpen' && !value ? '' : (field === 'openTime' ? value : currentDay.openTime)),
          closeTime: isOpening && !currentDay.closeTime ? '18:00' : (field === 'isOpen' && !value ? '' : (field === 'closeTime' ? value : currentDay.closeTime)),
        },
      };
    });
  };

  const handleFillWeekdays = () => {
    setBusinessHours((prev) => ({
      ...prev,
      monday: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      tuesday: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      wednesday: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      thursday: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      friday: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
    }));
    showToast('Horário comercial aplicado de Segunda a Sexta!');
  };

  const formatSummaryHours = (bh: BusinessHoursState): string => {
    const dayLabels: { key: keyof BusinessHoursState; label: string }[] = [
      { key: 'monday', label: 'Seg' },
      { key: 'tuesday', label: 'Ter' },
      { key: 'wednesday', label: 'Qua' },
      { key: 'thursday', label: 'Qui' },
      { key: 'friday', label: 'Sex' },
      { key: 'saturday', label: 'Sáb' },
      { key: 'sunday', label: 'Dom' },
    ];
    const openDays = dayLabels.filter((d) => bh[d.key]?.isOpen && bh[d.key]?.openTime && bh[d.key]?.closeTime);
    if (openDays.length === 0) return '';
    return dayLabels
      .map((d) => (bh[d.key]?.isOpen && bh[d.key]?.openTime ? `${d.label}: ${bh[d.key].openTime}-${bh[d.key].closeTime}` : `${d.label}: Fechado`))
      .join(' | ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!selectedCategoryId) {
      showToast('Selecione uma categoria válida para a loja.');
      return;
    }

    const selectedCategoryObj = categoriesList.find((c) => c.id === selectedCategoryId);
    const categoryName = selectedCategoryObj?.name || '';

    const hasAnyOpenDay = (Object.values(businessHours) as DaySchedule[]).some((d) => d.isOpen && Boolean(d.openTime) && Boolean(d.closeTime));
    const finalBusinessHoursJson = hasAnyOpenDay ? businessHours : null;
    const hoursSummary = hasAnyOpenDay ? formatSummaryHours(businessHours) : '';

    if (editingStore) {
      const updated: SellerStoreData & Record<string, any> = {
        ...editingStore,
        name: name.trim(),
        description: description.trim(),
        categoryId: selectedCategoryId,
        category: categoryName,
        country,
        countryCode: country,
        city: city.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logo,
        logoUrl: logo,
        banner,
        bannerUrl: banner,
        openingHours: hoursSummary,
        businessHoursJson: finalBusinessHoursJson,
        addressJson: { phone: phone.trim(), city: city.trim(), address: address.trim(), email: email.trim() },
      };
      onUpdateStore(updated);
    } else {
      // Create New Store Payload - Strict Rule: DO NOT INVENT FAKE DEFAULTS
      const newStore: SellerStoreData & Record<string, any> = {
        id: `store-${Date.now()}`,
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
        logo,
        logoUrl: logo,
        banner,
        bannerUrl: banner,
        description: description.trim(),
        categoryId: selectedCategoryId,
        category: categoryName,
        country,
        countryCode: country,
        city: city.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        openingHours: hoursSummary,
        businessHoursJson: finalBusinessHoursJson,
        addressJson: { phone: phone.trim(), city: city.trim(), address: address.trim(), email: email.trim() },
        exchangePolicy: '',
        warrantyPolicy: '',
        returnPolicy: '',
        status: 'active',
        isOfficial: false,
        rating: 0,
        followersCount: 0,
        salesCount: 0,
        acceptedCurrencies: [],
        acceptedPayments: [],
        shippingMethods: [],
      };
      onAddStore(newStore);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-700" /> Gerenciamento de Lojas (Multiloja)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crie e gerencie suas lojas comerciais com dados reais, banners, logotipos e horários independentes.
          </p>
        </div>

        <button
          onClick={() => {
            if (!isKycOk) {
              showToast('Você precisa ter a verificação KYC aprovada para criar uma loja.');
              return;
            }
            if (categoriesList.length === 0) {
              showToast('Nenhuma categoria disponível para associar à loja.');
              return;
            }
            handleOpenCreateModal();
          }}
          disabled={!isKycOk || categoriesList.length === 0}
          className={`font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0 ${
            !isKycOk || categoriesList.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
          }`}
          title={!isKycOk ? 'Verificação KYC Necessária' : categoriesList.length === 0 ? 'Nenhuma categoria disponível' : 'Cadastrar Nova Loja'}
        >
          <PlusCircle className="w-4 h-4" /> Cadastrar Nova Loja
        </button>
      </div>

      {categoryError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-900 text-xs font-bold">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{categoryError}</span>
        </div>
      )}

      {!categoryError && categoriesList.length === 0 && !isLoadingCategories && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-900 text-xs font-bold">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>Nenhuma categoria disponível. Aguarde o administrador cadastrar categorias para criar lojas.</span>
        </div>
      )}

      {/* Stores Grid */}
      {stores.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhuma loja cadastrada até o momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stores.map((s) => {
            const isSelected = s.id === selectedStoreId;
            const countryConf = countriesConfig[s.country] || countriesConfig.GW;
            const locationText = [s.city, s.address].filter(Boolean).join(' - ') || s.city || 'Localização não informada';
            const hoursText = s.openingHours ? s.openingHours : 'Horário não informado';

            return (
              <div
                key={s.id}
                className={`bg-white rounded-2xl border overflow-hidden transition shadow-2xs ${
                  isSelected ? 'border-2 border-emerald-600 ring-2 ring-emerald-500/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Store Banner */}
                <div className="h-28 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {s.banner ? (
                    <img src={s.banner} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-slate-400 flex items-center gap-2 text-xs font-bold">
                      <ImageIcon className="w-5 h-5" /> Sem Banner
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span>{countryConf.flag}</span> {countryConf.name}
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-md">
                      LOJA ATIVA NO PAINEL
                    </div>
                  )}
                </div>

                {/* Store Content */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3 -mt-10">
                    <div className="w-16 h-16 rounded-2xl border-2 border-white shadow-md bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {s.logo ? (
                        <img src={s.logo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-7 h-7 text-slate-400" />
                      )}
                    </div>
                    <div className="mt-8">
                      <h3 className="font-bold text-sm text-gray-900">{s.name}</h3>
                      <p className="text-[11px] text-gray-500 font-medium">{s.category || 'Categoria não especificada'}</p>
                    </div>
                  </div>

                  {s.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">{s.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium">
                    <div className="flex items-center gap-1.5 truncate" title={locationText}>
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{locationText}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate" title={s.phone || 'Sem telefone'}>
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{s.phone || 'Sem telefone'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate" title={hoursText}>
                      <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{hoursText}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate font-bold text-emerald-800">
                        {s.salesCount || 0} vendas • Nota {s.rating || '0.0'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    {!isSelected ? (
                      <button
                        onClick={() => {
                          onSelectStore(s.id);
                          showToast(`Loja alternada para: ${s.name}`);
                        }}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                      >
                        Selecionar esta Loja
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Loja em Uso
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(s)}
                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Editar Loja"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Form for Create / Edit Store */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-700" />
                {editingStore ? `Editar Loja: ${editingStore.name}` : 'Cadastrar Nova Loja Comercial'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Nome da Loja *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome comercial da loja"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Categoria Principal *</label>
                  {categoriesList.length > 0 ? (
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      required
                      className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold text-gray-900"
                    >
                      {categoriesList.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 border border-amber-300 bg-amber-50 text-amber-900 rounded-xl font-bold text-[11px]">
                      Nenhuma categoria disponível. Aguarde o administrador cadastrar categorias.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">País Sede da Loja *</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value as CountryCode)}
                    disabled={countriesLoading}
                    className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold disabled:opacity-60"
                  >
                    {(!operationalCountries || !operationalCountries.some((c) => c.code === country)) && country && (
                      <option value={country}>{country}</option>
                    )}
                    {operationalCountries?.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                  {countriesLoading && <p className="text-[11px] text-gray-500 mt-1">Carregando países operacionais...</p>}
                  {!countriesLoading && countriesError && (
                    <p className="text-[11px] text-red-600 mt-1">Não foi possível carregar a lista de países.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Cidade Sede</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: São Carlos, Bissau, Lisboa"
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Telefone da Loja</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Telefone comercial de contato"
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Endereço Físico (Rua, Número, Bairro)</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Informar apenas se houver loja/ponto físico"
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Descrição Comercial da Loja</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Descreva os produtos e diferenciais da sua loja..."
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-medium"
                />
              </div>

              {/* Uploads Section (R2) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                {/* Logo Upload */}
                <div>
                  <label className="block text-gray-800 font-bold mb-1">Logotipo da Loja (R2 Storage)</label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                      {logo ? (
                        <img src={logo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <label className="flex-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2">
                      {isUploadingLogo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-emerald-600" /> Selecionar Logo
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                        disabled={isUploadingLogo}
                      />
                    </label>
                  </div>
                </div>

                {/* Banner Upload */}
                <div>
                  <label className="block text-gray-800 font-bold mb-1">Banner da Loja (R2 Storage)</label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                      {banner ? (
                        <img src={banner} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <label className="flex-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2">
                      {isUploadingBanner ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-emerald-600" /> Selecionar Banner
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleBannerUpload}
                        className="hidden"
                        disabled={isUploadingBanner}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Day-by-Day Business Hours Configurator */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-900 font-bold flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" /> Configuração de Horário por Dia
                  </label>
                  <button
                    type="button"
                    onClick={handleFillWeekdays}
                    className="text-[11px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    ⚡ Preencher Segunda a Sexta (08h-18h)
                  </button>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'monday', label: 'Segunda-feira' },
                    { key: 'tuesday', label: 'Terça-feira' },
                    { key: 'wednesday', label: 'Quarta-feira' },
                    { key: 'thursday', label: 'Quinta-feira' },
                    { key: 'friday', label: 'Sexta-feira' },
                    { key: 'saturday', label: 'Sábado' },
                    { key: 'sunday', label: 'Domingo' },
                  ].map(({ key, label }) => {
                    const dayKey = key as keyof BusinessHoursState;
                    const sched = businessHours[dayKey];
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-gray-200 text-xs">
                        <label className="flex items-center gap-2 font-bold text-gray-800 min-w-[110px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sched.isOpen}
                            onChange={(e) => updateDaySchedule(dayKey, 'isOpen', e.target.checked)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          {label}
                        </label>

                        {sched.isOpen ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <input
                              type="time"
                              value={sched.openTime}
                              onChange={(e) => updateDaySchedule(dayKey, 'openTime', e.target.value)}
                              className="p-1 border border-gray-300 rounded-lg bg-gray-50 font-mono font-bold"
                            />
                            <span className="text-gray-400">até</span>
                            <input
                              type="time"
                              value={sched.closeTime}
                              onChange={(e) => updateDaySchedule(dayKey, 'closeTime', e.target.value)}
                              className="p-1 border border-gray-300 rounded-lg bg-gray-50 font-mono font-bold"
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-gray-400 italic">Fechado</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedCategoryId || categoriesList.length === 0}
                  className={`font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-xs ${
                    !selectedCategoryId || categoriesList.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  }`}
                >
                  <Save className="w-4 h-4" /> {editingStore ? 'Salvar Alterações' : 'Criar Loja Agora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
