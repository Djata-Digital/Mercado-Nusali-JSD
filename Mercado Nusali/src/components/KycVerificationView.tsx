import React, { useState } from 'react';
import { ShieldCheck, Upload, CheckCircle2, Clock, AlertTriangle, FileText, Camera, Building, UserCheck } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { KycDocumentType, CountryCode } from '../types';
import { countriesConfig } from '../utils/currencyUtils';

export const KycVerificationView: React.FC = () => {
  const { kycDocuments, submitKycDocument, selectedCountry } = useMarketplace();

  const [documentType, setDocumentType] = useState<KycDocumentType>('identity');
  const [documentNumber, setDocumentNumber] = useState('');
  const [country, setCountry] = useState<CountryCode>(selectedCountry);
  const [sellerName, setSellerName] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentNumber.trim()) return;

    submitKycDocument({
      sellerId: `sel-${Date.now()}`,
      sellerName: sellerName || 'Vendedor',
      documentType,
      documentNumber,
      country,
      fileUrl,
    });

    setDocumentNumber('');
  };

  const myDocuments = kycDocuments;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white rounded-2xl p-6 md:p-8 mb-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4" /> Verificação de Identidade Internacional (KYC)
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Selo Vendedor Verificado Mercado Nusali
            </h1>
            <p className="text-gray-300 text-sm mt-2 max-w-2xl">
              Para vender e receber pagamentos por Orange Money, MTN, PIX ou Transferência Bancária em Guiné-Bissau, Brasil, Portugal e Angola, é necessário validar seus documentos oficiais.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 flex items-center gap-4 text-xs shrink-0">
            <div className="text-center">
              <span className="block font-black text-lg text-emerald-400">100%</span>
              <span className="text-gray-300">Proteção Escrow</span>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div className="text-center">
              <span className="block font-black text-lg text-yellow-400">Badge</span>
              <span className="text-gray-300">Oficial no Perfil</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Verification Form */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" /> Enviar Novo Documento
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Nome do Vendedor / Empresa</label>
              <input
                type="text"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">País de Emissão</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryCode)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
              >
                {(Object.keys(countriesConfig) as CountryCode[]).map((c) => (
                  <option key={c} value={c}>
                    {countriesConfig[c].flag} {countriesConfig[c].name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Tipo de Documento</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as KycDocumentType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="identity">Bilhete de Identidade / Passaporte / RG</option>
                <option value="selfie">Selfie com Documento visível</option>
                <option value="proof_of_address">Comprovativo de Residência / Endereço</option>
                <option value="company_registration">Registo Comercial / Empresa</option>
                <option value="tax_document">NIF / CNPJ / Documento Fiscal</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Número do Documento / NIF</label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Ex: BI 98412039 ou NIF 59012384"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Upload da Foto / Scan do Documento</label>
              <div className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-xl p-4 text-center cursor-pointer bg-gray-50 transition">
                <Camera className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <span className="text-gray-600 block">Clique para capturar ou arrastar arquivo</span>
                <span className="text-[10px] text-gray-400">PNG, JPG ou PDF (Máx. 10MB)</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg shadow-md transition flex items-center justify-center gap-2 text-sm"
            >
              <ShieldCheck className="w-4 h-4" /> Submeter para Verificação Admin
            </button>
          </form>
        </div>

        {/* Status List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" /> Histórico de Documentos KYC
              </span>
              <span className="text-xs bg-blue-50 text-blue-800 font-bold px-2.5 py-1 rounded-full">
                {myDocuments.length} enviados
              </span>
            </h2>

            <div className="space-y-4">
              {myDocuments.map((doc) => {
                const conf = countriesConfig[doc.country] || countriesConfig.GW;
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden shrink-0 border border-gray-300">
                        <img src={doc.fileUrl} alt="Doc" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{doc.sellerName}</span>
                          <span className="text-xs">{conf.flag}</span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium capitalize mt-0.5">
                          {doc.documentType.replace(/_/g, ' ')} • <span className="font-mono text-gray-800">{doc.documentNumber}</span>
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">Submetido em: {doc.submittedAt}</p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {doc.status === 'verified' && (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 font-bold text-xs px-3 py-1 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Aprovado & Verificado
                        </span>
                      )}
                      {doc.status === 'under_review' && (
                        <span className="inline-flex items-center gap-1.5 bg-yellow-100 text-yellow-800 font-bold text-xs px-3 py-1 rounded-full border border-yellow-200">
                          <Clock className="w-4 h-4 text-yellow-600" /> Em Análise Admin
                        </span>
                      )}
                      {doc.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 font-bold text-xs px-3 py-1 rounded-full border border-blue-200">
                          <Clock className="w-4 h-4 text-blue-600" /> Pendente
                        </span>
                      )}
                      {doc.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-800 font-bold text-xs px-3 py-1 rounded-full border border-red-200">
                          <AlertTriangle className="w-4 h-4 text-red-600" /> Rejeitado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Verification Benefits Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <UserCheck className="w-6 h-6 text-emerald-700 mb-2" />
              <h3 className="font-bold text-emerald-950 text-sm">Badge "Vendedor Verificado"</h3>
              <p className="text-xs text-emerald-800 mt-1">
                Aumenta em até 3x a conversão de vendas e gera confiança imediata com compradores em Guiné-Bissau e no exterior.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <Building className="w-6 h-6 text-blue-700 mb-2" />
              <h3 className="font-bold text-blue-950 text-sm">Acesso a Múltiplas Moedas</h3>
              <p className="text-xs text-blue-800 mt-1">
                Receba saldos diretos em XOF (CFA), BRL (R$), EUR (€) ou USD com liquidação rápida na sua carteira Nusali Wallet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
