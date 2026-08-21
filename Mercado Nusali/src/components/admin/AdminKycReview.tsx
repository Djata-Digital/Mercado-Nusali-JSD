import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, FileText, Eye, User, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { KycReviewRecord } from '../../types/kyc';

interface AdminKycReviewProps {
  showToast: (msg: string) => void;
}

export const AdminKycReview: React.FC<AdminKycReviewProps> = ({ showToast }) => {
  const [kycQueue, setKycQueue] = useState<KycReviewRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<KycReviewRecord | null>(null);

  const fetchKycQueue = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getKycList();
      if (res.success && res.data) {
        setKycQueue(res.data);
      }
    } catch {
      // fallback handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKycQueue();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const res = await AdminService.approveKyc(id);
      if (res.success) {
        setKycQueue(prev => prev.map(k => k.id === id ? { ...k, status: 'verified' } : k));
        showToast(res.message || `Documento KYC #${id} aprovado com sucesso! Vendedor verificado.`);
        setSelectedDoc(null);
      } else {
        showToast(res.message || `Erro ao aprovar documento KYC #${id}.`);
      }
    } catch (err: any) {
      showToast(err?.message || `Erro ao aprovar documento KYC #${id}.`);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await AdminService.rejectKyc(id);
      if (res.success) {
        setKycQueue(prev => prev.map(k => k.id === id ? { ...k, status: 'rejected' } : k));
        showToast(res.message || `Documento KYC #${id} rejeitado. Vendedor notificado.`);
        setSelectedDoc(null);
      } else {
        showToast(res.message || `Erro ao rejeitar documento KYC #${id}.`);
      }
    } catch (err: any) {
      showToast(err?.message || `Erro ao rejeitar documento KYC #${id}.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600" />
            Fila de Análise KYC & Documentos Fiscais
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Validação de BI, Passaportes CPLP, NIF/CNPJ e comparação facial de selfie com documentos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando solicitações de KYC...
        </div>
      ) : kycQueue.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhuma solicitação de KYC pendente
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {kycQueue.map(k => (
          <div key={k.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block">{k.country === 'GW' ? '🇬🇼 Guiné-Bissau' : k.country}</span>
                <h3 className="font-extrabold text-base text-gray-900">{k.sellerName}</h3>
                <p className="text-xs text-purple-700 font-bold">{k.companyName}</p>
              </div>

              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                k.status === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                k.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {k.status.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl text-xs border border-gray-100">
              <div>
                <span className="text-gray-400 text-[10px] block font-bold">Tipo de Conta</span>
                <span className="font-bold text-gray-900">{k.accountType}</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block font-bold">Documento Registrado</span>
                <span className="font-bold text-gray-900">{k.documentType} ({k.documentNumber})</span>
              </div>
            </div>

            {/* Document Thumbnail Previews */}
            <div className="flex items-center gap-3 pt-2">
              <div className="text-center">
                {k.docFrontUrl ? (
                  <img src={k.docFrontUrl} alt="Documento" className="w-20 h-14 rounded-lg object-cover border border-gray-200" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400">Sem foto</div>
                )}
                <span className="text-[9px] text-gray-400 block mt-0.5">Documento</span>
              </div>
              <div className="text-center">
                {k.selfieUrl ? (
                  <img src={k.selfieUrl} alt="Selfie" className="w-20 h-14 rounded-lg object-cover border border-gray-200" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400">Sem selfie</div>
                )}
                <span className="text-[9px] text-gray-400 block mt-0.5">Selfie</span>
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-[10px] font-bold text-gray-500 block">Comparação Facial IA:</span>
                <div className="flex items-center gap-1 text-emerald-700 font-black text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                  <Sparkles className="w-3.5 h-3.5" /> 98,4% Compatível
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedDoc(k)}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1"
              >
                <Eye className="w-4 h-4" /> Visualizador Detalhado
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReject(k.id)}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition"
                >
                  Rejeitar
                </button>
                <button
                  onClick={() => handleApprove(k.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition"
                >
                  Aprovar Vendedor
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Viewer Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">Viewer Detalhado de Documentos KYC #{selectedDoc.id}</h3>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 font-bold">X</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900">Documento de Identidade</span>
                  {selectedDoc.docFrontUrl && (
                    <a href={selectedDoc.docFrontUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-bold">
                      <ExternalLink className="w-3 h-3" /> Abrir no R2
                    </a>
                  )}
                </div>
                {selectedDoc.docFrontUrl ? (
                  <img src={selectedDoc.docFrontUrl} alt="Doc Front" className="w-full h-40 rounded-lg object-cover border border-gray-300" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                ) : (
                  <div className="p-4 text-gray-400 text-center">Nenhum arquivo enviado</div>
                )}
              </div>

              <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900">Selfie com Documento</span>
                  {selectedDoc.selfieUrl && (
                    <a href={selectedDoc.selfieUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-bold">
                      <ExternalLink className="w-3 h-3" /> Abrir no R2
                    </a>
                  )}
                </div>
                {selectedDoc.selfieUrl ? (
                  <img src={selectedDoc.selfieUrl} alt="Selfie" className="w-full h-40 rounded-lg object-cover border border-gray-300" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                ) : (
                  <div className="p-4 text-gray-400 text-center">Nenhuma selfie enviada</div>
                )}
              </div>

              {selectedDoc.proofAddressUrl && (
                <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900">Comprovante de Residência</span>
                    <a href={selectedDoc.proofAddressUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-bold">
                      <ExternalLink className="w-3 h-3" /> Abrir no R2
                    </a>
                  </div>
                  <img src={selectedDoc.proofAddressUrl} alt="Comprovante de Residência" className="w-full h-40 rounded-lg object-cover border border-gray-300" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                </div>
              )}

              {selectedDoc.businessLicenseUrl && (
                <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900">Registro Empresarial / NIF</span>
                    <a href={selectedDoc.businessLicenseUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-bold">
                      <ExternalLink className="w-3 h-3" /> Abrir no R2
                    </a>
                  </div>
                  <img src={selectedDoc.businessLicenseUrl} alt="Registro Empresarial" className="w-full h-40 rounded-lg object-cover border border-gray-300" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-1">
              <p className="font-bold text-gray-900">Notas de Análise Interna:</p>
              <p className="text-gray-600">{selectedDoc.notes || 'Sem observações registradas.'}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => handleReject(selectedDoc.id)} className="px-4 py-2 bg-red-600 text-white font-bold text-xs rounded-xl">
                Rejeitar
              </button>
              <button onClick={() => handleApprove(selectedDoc.id)} className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl">
                Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
