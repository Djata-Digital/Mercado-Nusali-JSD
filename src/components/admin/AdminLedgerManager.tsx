import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Scale, Search, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LedgerAdminApi, type Page } from '../../api/clients/LedgerAdminApi';
import {
  CAUSE_LABEL, DECISION_STATUS_LABEL, EVENT_STATUS_LABEL, FINDING_STATUS_LABEL, PARTY_LABEL, SEVERITY_LABEL, STAGE_LABEL, TX_TYPES, TX_TYPE_LABEL,
  canAdminLedger, canReadLedger, eventStatusClass, fmtDate, fmtMoney, ledgerErrorMessage, minLen, newIdempotencyKey, parseMoney, severityClass,
} from '../../utils/ledgerAdminView';

/**
 * Gestão do Ledger Sombra (E6). SOMENTE LEITURA sobre os lançamentos — não existe edição nem exclusão de lançamentos, e nenhuma ação daqui movimenta dinheiro real ou debita
 * carteiras. As ações (reparo manual, recolocar/descartar, reconhecer, evidência/proposta/aprovação de chargeback, reversão de frete) chamam os serviços já existentes; as regras
 * (quatro olhos, teto N do vendedor, evidências, auditoria, idempotência) e a autorização por perfil são do SERVIDOR. A tela só esconde o que o perfil não pode usar.
 */
interface Props { showToast: (msg: string) => void }
type Tab = 'summary' | 'transactions' | 'outbox' | 'findings' | 'chargebacks' | 'shipping';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Resumo' }, { id: 'transactions', label: 'Lançamentos' }, { id: 'outbox', label: 'Eventos (outbox)' },
  { id: 'findings', label: 'Divergências' }, { id: 'chargebacks', label: 'Chargebacks' }, { id: 'shipping', label: 'Reversão de frete' },
];

const card = 'bg-white rounded-2xl border border-gray-200 shadow-xs';
const input = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500';
const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-emerald-600 hover:bg-emerald-500 text-white`;
const btnGhost = `${btn} bg-gray-100 hover:bg-gray-200 text-gray-800`;
/** Tabelas: espaço entre colunas (sem isso os cabeçalhos e valores ficam colados) e rolagem horizontal no celular. */
const tbl = 'w-full text-xs [&_th]:pr-3 [&_td]:pr-3 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_th]:font-bold [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap';
const btnDanger = `${btn} bg-rose-600 hover:bg-rose-500 text-white`;

const Badge: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${cls}`}>{children}</span>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (<label className="block text-[11px] font-bold text-gray-600 space-y-1"><span>{label}</span>{children}</label>);
const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="font-mono text-[11px] break-all">{children}</span>;
const Json: React.FC<{ value: unknown }> = ({ value }) => <pre className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-[10px] overflow-x-auto max-h-56">{JSON.stringify(value, null, 2)}</pre>;
const Empty: React.FC<{ children?: React.ReactNode }> = ({ children }) => <div className="text-center text-xs text-gray-500 py-8">{children ?? 'Nenhum registro encontrado.'}</div>;
const Loading: React.FC = () => <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;

const Pager: React.FC<{ page: Page<any> | null; onOffset: (o: number) => void }> = ({ page, onOffset }) => {
  if (!page) return null;
  const from = page.total === 0 ? 0 : page.offset + 1; const to = Math.min(page.offset + page.limit, page.total);
  return (
    <div className="flex items-center justify-between text-[11px] text-gray-600 px-1 pt-2">
      <span>{from}–{to} de {page.total}</span>
      <span className="flex gap-1">
        <button className={btnGhost} disabled={page.offset <= 0} onClick={() => onOffset(Math.max(0, page.offset - page.limit))} aria-label="Página anterior"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <button className={btnGhost} disabled={page.offset + page.limit >= page.total} onClick={() => onOffset(page.offset + page.limit)} aria-label="Próxima página"><ChevronRight className="w-3.5 h-3.5" /></button>
      </span>
    </div>
  );
};

/** Modal de motivo/nota obrigatório (mínimo de caracteres igual ao dos serviços; o servidor revalida). */
const ReasonModal: React.FC<{ title: string; hint: string; min: number; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: (text: string) => Promise<void> }> = ({ title, hint, min, confirmLabel, danger, onCancel, onConfirm }) => {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3 shadow-2xl">
        <h3 className="font-black text-sm text-gray-900">{title}</h3>
        <p className="text-[11px] text-gray-600">{hint}</p>
        <textarea className={`${input} h-24`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Motivo" />
        <div className="text-[10px] text-gray-500">{text.trim().length}/{min} caracteres mínimos</div>
        {err && <div className="text-[11px] text-rose-700 font-bold" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={danger ? btnDanger : btnPrimary} disabled={busy || !minLen(text, min)} onClick={async () => { setBusy(true); setErr(null); try { await onConfirm(text.trim()); } catch (e) { setErr(ledgerErrorMessage(e)); } finally { setBusy(false); } }}>{busy ? 'Enviando…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

/** Confirmação explícita (resumo do efeito + botão): ações que gravam no ledger nunca disparam com um clique só. O servidor continua sendo a autoridade. */
const ConfirmModal: React.FC<{ title: string; lines: string[]; confirmLabel: string; onCancel: () => void; onConfirm: () => Promise<void> }> = ({ title, lines, confirmLabel, onCancel, onConfirm }) => {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3 shadow-2xl">
        <h3 className="font-black text-sm text-gray-900">{title}</h3>
        <ul className="text-[11px] text-gray-700 space-y-1 list-disc pl-4">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        {err && <div className="text-[11px] text-rose-700 font-bold" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={btnPrimary} disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await onConfirm(); } catch (e) { setErr(ledgerErrorMessage(e)); setBusy(false); } }}>{busy ? 'Enviando…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

/** Carrega uma página com filtros (filtros aplicados só ao clicar em "Filtrar"). */
function usePaged(fetcher: (q: Record<string, string | number | undefined>) => Promise<any>, initial: Record<string, string>) {
  const [filters, setFilters] = useState<Record<string, string>>(initial);
  const [applied, setApplied] = useState<Record<string, string>>(initial);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetcher({ ...applied, limit: 25, offset });
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Resposta inválida.');
      setPage(res.data);
    } catch (e) { setError(ledgerErrorMessage(e)); } finally { setLoading(false); }
  }, [applied, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  return { filters, setFilters, apply: () => { setOffset(0); setApplied({ ...filters }); }, offset, setOffset, page, error, loading, reload: load };
}

const ErrorBox: React.FC<{ message: string | null; onRetry?: () => void }> = ({ message, onRetry }) => message ? (
  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs" role="alert"><AlertTriangle className="w-4 h-4 shrink-0" /><span className="flex-1">{message}</span>{onRetry && <button className={btnGhost} onClick={onRetry}>Tentar de novo</button>}</div>
) : null;

// =================================================================================================================================================
// Resumo
// =================================================================================================================================================
const SummaryView: React.FC = () => {
  const [data, setData] = useState<any>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { const r = await LedgerAdminApi.summary(); if (!r.success) throw new Error(r.error?.message); setData(r.data); } catch (e) { setError(ledgerErrorMessage(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Loading />;
  const stat = (label: string, value: React.ReactNode, tone = 'text-gray-900') => (<div className="rounded-xl border border-gray-200 p-3"><div className="text-[10px] font-bold text-gray-500 uppercase">{label}</div><div className={`text-lg font-black ${tone}`}>{value}</div></div>);
  const o = data.outbox; const r = data.reconciliation; const c = data.chargebacks;
  const balanced = Number(data.imbalanceNet) === 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat('Lançamentos', data.totals.transactions)}{stat('Partidas (débito/crédito)', data.totals.entries)}{stat('Contas', data.totals.accounts)}
        {stat('Saldo líquido do ledger', balanced ? 'Balanceado (0)' : data.imbalanceNet, balanced ? 'text-emerald-700' : 'text-rose-700')}
      </div>
      <div className={`${card} p-4`}>
        <h3 className="font-black text-xs text-gray-800 mb-2">Lançamentos por tipo e estado</h3>
        {data.transactionsByTypeAndStatus.length === 0 ? <Empty>Ainda não há lançamentos.</Empty> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Tipo</th><th>Estado</th><th className="text-right">Quantidade</th></tr></thead><tbody>
            {data.transactionsByTypeAndStatus.map((x: any) => (<tr key={`${x.type}-${x.status}`} className="border-t border-gray-100"><td className="py-1">{TX_TYPE_LABEL[x.type] ?? x.type}</td><td>{x.status}</td><td className="text-right font-bold">{x.n}</td></tr>))}
          </tbody></table></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="font-black text-xs text-gray-800">Eventos (outbox)</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {stat('Pendentes', o.pending)}{stat('Nova tentativa', o.retrying)}{stat('Concluídos', o.done, 'text-emerald-700')}
            {stat('Exigem intervenção', o.needsIntervention, o.needsIntervention > 0 ? 'text-rose-700' : 'text-gray-900')}{stat('Ignorados', o.skipped)}{stat('Descartados', o.dismissed)}
          </div>
          {o.staleProcessing > 0 && <div className="text-[11px] text-amber-700 font-bold">{o.staleProcessing} evento(s) com processamento parado.</div>}
        </div>
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="font-black text-xs text-gray-800">Divergências da reconciliação (abertas)</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {stat('Críticas', r.open.critical, r.open.critical > 0 ? 'text-rose-700' : 'text-gray-900')}{stat('Avisos', r.open.warning)}{stat('Informativas', r.open.info)}
          </div>
          <div className="text-[11px] text-gray-500">{r.acknowledged} reconhecida(s) · última execução: {r.lastRun ? `${fmtDate(r.lastRun.started_at)} (${r.lastRun.status})` : '—'}</div>
        </div>
      </div>
      <div className={`${card} p-4`}>
        <h3 className="font-black text-xs text-gray-800 mb-2">Chargebacks e reversões de frete</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {stat('Perdas após liberação', c.allocations_after_release)}{stat('Pendentes de decisão', c.pending_decision, c.pending_decision > 0 ? 'text-amber-700' : 'text-gray-900')}
          {stat('Sobreposição com reembolso', c.overlap_refund, c.overlap_refund > 0 ? 'text-rose-700' : 'text-gray-900')}{stat('Propostas abertas', c.proposals_open)}{stat('Reversões de frete', data.shippingCostReversals)}
        </div>
      </div>
    </div>
  );
};

// =================================================================================================================================================
// Lançamentos
// =================================================================================================================================================
const TransactionsView: React.FC = () => {
  const p = usePaged(LedgerAdminApi.transactions, { orderId: '', type: '', status: '', id: '', from: '', to: '' });
  const [detail, setDetail] = useState<any>(null); const [dErr, setDErr] = useState<string | null>(null);
  const open = async (id: string) => { setDErr(null); try { const r = await LedgerAdminApi.transaction(id); if (!r.success) throw new Error(r.error?.message); setDetail(r.data); } catch (e) { setDErr(ledgerErrorMessage(e)); } };
  const f = p.filters; const set = (k: string, v: string) => p.setFilters({ ...f, [k]: v });
  return (
    <div className="space-y-3">
      <div className={`${card} p-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-end`}>
        <Field label="Pedido"><input className={input} value={f.orderId} onChange={(e) => set('orderId', e.target.value)} /></Field>
        <Field label="Tipo"><select className={input} value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">Todos</option>{TX_TYPES.map((t) => <option key={t} value={t}>{TX_TYPE_LABEL[t]}</option>)}</select></Field>
        <Field label="Estado"><select className={input} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Todos</option><option>POSTED</option><option>DRAFT</option><option>REVERSED</option></select></Field>
        <Field label="Identificador / chave"><input className={input} value={f.id} onChange={(e) => set('id', e.target.value)} /></Field>
        <Field label="De"><input type="date" className={input} value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label="Até"><input type="date" className={input} value={f.to} onChange={(e) => set('to', e.target.value)} /></Field>
        <button className={`${btnPrimary} flex items-center justify-center gap-1`} onClick={p.apply}><Search className="w-3.5 h-3.5" /> Filtrar</button>
      </div>
      <ErrorBox message={p.error} onRetry={p.reload} />
      <div className={`${card} p-3`}>
        {p.loading && !p.page ? <Loading /> : !p.page || p.page.items.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Quando</th><th>Tipo</th><th>Estado</th><th>Pedido</th><th>Partidas</th><th>Chave</th></tr></thead><tbody>
            {p.page.items.map((t: any) => (
              <tr key={t.id} className="border-t border-gray-100 hover:bg-emerald-50 cursor-pointer" onClick={() => open(t.id)}>
                <td className="py-1.5 whitespace-nowrap">{fmtDate(t.occurred_at)}</td><td>{TX_TYPE_LABEL[t.type] ?? t.type}</td><td>{t.status}</td><td><Mono>{t.order_id}</Mono></td><td>{t.entry_count}</td><td><Mono>{t.idempotency_key}</Mono></td>
              </tr>))}
          </tbody></table></div>)}
        <Pager page={p.page} onOffset={p.setOffset} />
      </div>
      <ErrorBox message={dErr} />
      {detail && (
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-black text-sm text-gray-900">{TX_TYPE_LABEL[detail.transaction.type] ?? detail.transaction.type}</h3><div className="text-[11px] text-gray-500"><Mono>{detail.transaction.id}</Mono> · {detail.transaction.status} · {fmtDate(detail.transaction.occurred_at)}</div></div>
            <button className={btnGhost} onClick={() => setDetail(null)} aria-label="Fechar"><X className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-[11px] text-gray-700">{detail.transaction.reason}</p>
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">#</th><th>Conta</th><th>Parte</th><th>Direção</th><th className="text-right">Valor</th><th>Dimensões</th></tr></thead><tbody>
            {detail.entries.map((e: any) => (<tr key={e.id} className="border-t border-gray-100 align-top"><td className="py-1">{e.line_number}</td><td className="font-bold">{e.account_code}</td><td>{e.owner_type}{e.owner_id ? ` ${e.owner_id}` : ''}</td><td className={e.direction === 'DEBIT' ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>{e.direction === 'DEBIT' ? 'Débito' : 'Crédito'}</td><td className="text-right">{fmtMoney(e.amount, e.currency)}</td><td><Mono>{e.dimensions ? JSON.stringify(e.dimensions) : '—'}</Mono></td></tr>))}
          </tbody><tfoot><tr className="border-t border-gray-300 font-black"><td colSpan={3} className="py-1">Totais</td><td colSpan={3} className="text-right whitespace-nowrap">D {fmtMoney(detail.totals.debit, detail.transaction.currency)} · C {fmtMoney(detail.totals.credit, detail.transaction.currency)} {detail.totals.balanced ? <Badge cls="bg-emerald-100 text-emerald-800">Balanceado</Badge> : <Badge cls="bg-rose-100 text-rose-800">DESBALANCEADO</Badge>}</td></tr></tfoot></table></div>
          {detail.transaction.metadata_json && <details><summary className="text-[11px] font-bold text-gray-600 cursor-pointer">Metadados</summary><Json value={detail.transaction.metadata_json} /></details>}
          <p className="text-[10px] text-gray-500">Lançamentos são imutáveis: não podem ser editados nem apagados.</p>
        </div>)}
    </div>
  );
};

// =================================================================================================================================================
// Outbox (+ reparo manual)
// =================================================================================================================================================
const OutboxView: React.FC<{ isAdmin: boolean; showToast: (m: string) => void }> = ({ isAdmin, showToast }) => {
  const p = usePaged(LedgerAdminApi.outbox, { status: '', type: '', orderId: '', id: '' });
  const [detail, setDetail] = useState<any>(null); const [dErr, setDErr] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { kind: 'requeue' | 'dismiss'; id: string }>(null);
  const [repair, setRepair] = useState<any>(null); const [repairBusy, setRepairBusy] = useState(false); const [confirmApply, setConfirmApply] = useState(false); const [repairErr, setRepairErr] = useState<string | null>(null);
  const f = p.filters; const set = (k: string, v: string) => p.setFilters({ ...f, [k]: v });
  const open = async (id: string) => { setDErr(null); try { const r = await LedgerAdminApi.outboxEvent(id); if (!r.success) throw new Error(r.error?.message); setDetail(r.data); } catch (e) { setDErr(ledgerErrorMessage(e)); } };
  const runRepair = async (apply: boolean) => {
    setRepairBusy(true); setRepairErr(null);
    try { const r = await LedgerAdminApi.repairMissing(apply ? { apply: true, confirm: true } : {}); if (!r.success) throw new Error(r.error?.message); setRepair(r.data); setConfirmApply(false); if (apply) { showToast(`Reparo aplicado: ${r.data.enqueued} evento(s) criado(s).`); p.reload(); } }
    catch (e) { setRepairErr(ledgerErrorMessage(e)); } finally { setRepairBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className={`${card} p-4 grid grid-cols-2 md:grid-cols-5 gap-2 items-end`}>
        <Field label="Estado"><select className={input} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Todos</option>{Object.keys(EVENT_STATUS_LABEL).map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label="Tipo"><select className={input} value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">Todos</option>{TX_TYPES.map((t) => <option key={t} value={t}>{TX_TYPE_LABEL[t]}</option>)}</select></Field>
        <Field label="Pedido"><input className={input} value={f.orderId} onChange={(e) => set('orderId', e.target.value)} /></Field>
        <Field label="Identificador / chave"><input className={input} value={f.id} onChange={(e) => set('id', e.target.value)} /></Field>
        <button className={`${btnPrimary} flex items-center justify-center gap-1`} onClick={p.apply}><Search className="w-3.5 h-3.5" /> Filtrar</button>
      </div>
      <ErrorBox message={p.error} onRetry={p.reload} />
      <div className={`${card} p-3`}>
        {p.loading && !p.page ? <Loading /> : !p.page || p.page.items.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Criado</th><th>Tipo</th><th>Estado</th><th>Tentativas</th><th>Pedido</th><th>Erro</th></tr></thead><tbody>
            {p.page.items.map((e: any) => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-emerald-50 cursor-pointer" onClick={() => open(e.id)}>
                <td className="py-1.5 whitespace-nowrap">{fmtDate(e.created_at)}</td><td>{TX_TYPE_LABEL[e.event_type] ?? e.event_type}</td><td><Badge cls={eventStatusClass(e.status)}>{EVENT_STATUS_LABEL[e.status] ?? e.status}</Badge></td><td>{e.attempts}/{e.max_attempts}</td><td><Mono>{e.order_id}</Mono></td><td className="text-[10px]">{e.last_error_code ?? ''}</td>
              </tr>))}
          </tbody></table></div>)}
        <Pager page={p.page} onOffset={p.setOffset} />
      </div>
      <ErrorBox message={dErr} />
      {detail && (
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-black text-sm text-gray-900">{TX_TYPE_LABEL[detail.event.event_type] ?? detail.event.event_type}</h3><div className="text-[11px] text-gray-500"><Mono>{detail.event.id}</Mono> · <Mono>{detail.event.idempotency_key}</Mono></div></div>
            <button className={btnGhost} onClick={() => setDetail(null)} aria-label="Fechar"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs"><Badge cls={eventStatusClass(detail.event.status)}>{EVENT_STATUS_LABEL[detail.event.status] ?? detail.event.status}</Badge><span>Tentativas {detail.event.attempts}/{detail.event.max_attempts}</span>{detail.event.next_attempt_at && <span>Próxima: {fmtDate(detail.event.next_attempt_at)}</span>}{detail.event.ledger_transaction_id && <span>Lançamento: <Mono>{detail.event.ledger_transaction_id}</Mono></span>}</div>
          {detail.event.last_error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-[11px] text-rose-900"><b>{detail.event.last_error_code}</b>: {detail.event.last_error}</div>}
          <details><summary className="text-[11px] font-bold text-gray-600 cursor-pointer">Snapshot financeiro do evento</summary><Json value={detail.event.snapshot_json} /></details>
          {detail.audit.length > 0 && <div><div className="text-[11px] font-bold text-gray-600 mb-1">Auditoria</div><ul className="text-[11px] space-y-1">{detail.audit.map((a: any, i: number) => <li key={i}>{fmtDate(a.created_at)} · {a.action} · <Mono>{a.actor_user_id}</Mono></li>)}</ul></div>}
          {isAdmin ? (
            <div className="flex gap-2">
              {['NEEDS_INTERVENTION', 'DISMISSED', 'SKIPPED', 'RETRYING'].includes(detail.event.status) && <button className={btnPrimary} onClick={() => setModal({ kind: 'requeue', id: detail.event.id })}>Recolocar na fila</button>}
              {detail.event.status !== 'DONE' && detail.event.status !== 'DISMISSED' && <button className={btnDanger} onClick={() => setModal({ kind: 'dismiss', id: detail.event.id })}>Descartar</button>}
            </div>
          ) : <p className="text-[10px] text-gray-500">Recolocar ou descartar eventos é restrito ao Administrador Geral.</p>}
        </div>)}
      {isAdmin && (
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="font-black text-xs text-gray-800">Reparo manual de eventos ausentes</h3>
          <p className="text-[11px] text-gray-600">Cria os eventos que faltam para fatos financeiros já confirmados (pagamento, liberação, reembolso, chargeback, reversão). Nunca recalcula valores, respeita o cutoff e é idempotente. Simule primeiro.</p>
          <ErrorBox message={repairErr} />
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnGhost} disabled={repairBusy} onClick={() => runRepair(false)}>Simular reparo</button>
            {repair && repair.dryRun && repair.candidates.length > 0 && (
              <label className="flex items-center gap-1 text-[11px] font-bold text-gray-700"><input type="checkbox" checked={confirmApply} onChange={(e) => setConfirmApply(e.target.checked)} /> Confirmo criar {repair.candidates.length} evento(s)</label>)}
            {repair && repair.dryRun && repair.candidates.length > 0 && <button className={btnPrimary} disabled={repairBusy || !confirmApply} onClick={() => runRepair(true)}>Aplicar reparo</button>}
          </div>
          {repair && (<div className="text-[11px] text-gray-700">{repair.dryRun ? `Simulação: ${repair.candidates.length} candidato(s).` : `Aplicado: ${repair.enqueued} criado(s), ${repair.existing} já existiam, ${repair.failed} falha(s).`}
            {repair.candidates.length > 0 && <ul className="mt-1 space-y-0.5">{repair.candidates.slice(0, 50).map((c: any, i: number) => <li key={i}><Mono>{c.eventType}</Mono> · <Mono>{c.chargebackSubjectId ?? c.reversalId ?? c.refundId ?? c.orderId}</Mono></li>)}</ul>}</div>)}
        </div>)}
      {modal && (
        <ReasonModal title={modal.kind === 'requeue' ? 'Recolocar evento na fila' : 'Descartar evento'} min={10} danger={modal.kind === 'dismiss'} confirmLabel={modal.kind === 'requeue' ? 'Recolocar' : 'Descartar'}
          hint={modal.kind === 'requeue' ? 'Informe por que o evento pode ser reprocessado (ex.: a causa foi corrigida). Fica auditado.' : 'O evento não será lançado e a lacuna contábil continuará visível na reconciliação. Informe o motivo. Fica auditado.'}
          onCancel={() => setModal(null)}
          onConfirm={async (reason) => { const r = modal.kind === 'requeue' ? await LedgerAdminApi.requeue(modal.id, reason) : await LedgerAdminApi.dismiss(modal.id, reason); if (!r.success) throw new Error(r.error?.message); showToast(modal.kind === 'requeue' ? 'Evento recolocado na fila.' : 'Evento descartado.'); setModal(null); setDetail(null); p.reload(); }} />)}
    </div>
  );
};

// =================================================================================================================================================
// Divergências
// =================================================================================================================================================
const FindingsView: React.FC<{ isAdmin: boolean; showToast: (m: string) => void }> = ({ isAdmin, showToast }) => {
  const p = usePaged(LedgerAdminApi.findings, { status: 'OPEN', severity: '', type: '', orderId: '' });
  const [detail, setDetail] = useState<any>(null); const [dErr, setDErr] = useState<string | null>(null); const [ack, setAck] = useState<string | null>(null);
  const f = p.filters; const set = (k: string, v: string) => p.setFilters({ ...f, [k]: v });
  const open = async (id: string) => { setDErr(null); try { const r = await LedgerAdminApi.finding(id); if (!r.success) throw new Error(r.error?.message); setDetail(r.data); } catch (e) { setDErr(ledgerErrorMessage(e)); } };
  return (
    <div className="space-y-3">
      <div className={`${card} p-4 grid grid-cols-2 md:grid-cols-5 gap-2 items-end`}>
        <Field label="Estado"><select className={input} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Todos</option>{Object.keys(FINDING_STATUS_LABEL).map((s) => <option key={s} value={s}>{FINDING_STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label="Gravidade"><select className={input} value={f.severity} onChange={(e) => set('severity', e.target.value)}><option value="">Todas</option>{Object.keys(SEVERITY_LABEL).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}</select></Field>
        <Field label="Tipo"><input className={input} value={f.type} onChange={(e) => set('type', e.target.value)} placeholder="ex.: PAYMENT_LEDGER_MISSING_NO_EVENT" /></Field>
        <Field label="Pedido"><input className={input} value={f.orderId} onChange={(e) => set('orderId', e.target.value)} /></Field>
        <button className={`${btnPrimary} flex items-center justify-center gap-1`} onClick={p.apply}><Search className="w-3.5 h-3.5" /> Filtrar</button>
      </div>
      <ErrorBox message={p.error} onRetry={p.reload} />
      <div className={`${card} p-3`}>
        {p.loading && !p.page ? <Loading /> : !p.page || p.page.items.length === 0 ? <Empty>Nenhuma divergência com estes filtros.</Empty> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Gravidade</th><th>Tipo</th><th>Estado</th><th>Pedido</th><th>Vista</th><th>Última vez</th></tr></thead><tbody>
            {p.page.items.map((x: any) => (
              <tr key={x.id} className="border-t border-gray-100 hover:bg-emerald-50 cursor-pointer" onClick={() => open(x.id)}>
                <td className="py-1.5"><Badge cls={severityClass(x.severity)}>{SEVERITY_LABEL[x.severity] ?? x.severity}</Badge></td><td className="font-bold">{x.finding_type}</td><td>{FINDING_STATUS_LABEL[x.status] ?? x.status}</td><td><Mono>{x.order_id ?? '—'}</Mono></td><td>{x.seen_count}×</td><td className="whitespace-nowrap">{fmtDate(x.last_seen_at)}</td>
              </tr>))}
          </tbody></table></div>)}
        <Pager page={p.page} onOffset={p.setOffset} />
      </div>
      <ErrorBox message={dErr} />
      {detail && (
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-black text-sm text-gray-900">{detail.finding.finding_type}</h3><div className="text-[11px] text-gray-500"><Badge cls={severityClass(detail.finding.severity)}>{SEVERITY_LABEL[detail.finding.severity]}</Badge> · {FINDING_STATUS_LABEL[detail.finding.status]} · visto {detail.finding.seen_count}× · desde {fmtDate(detail.finding.first_seen_at)}</div></div>
            <button className={btnGhost} onClick={() => setDetail(null)} aria-label="Fechar"><X className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-xs text-gray-800">{detail.finding.detail}</p>
          {(detail.finding.expected_json || detail.finding.actual_json) && (<div className="grid md:grid-cols-2 gap-2"><div><div className="text-[11px] font-bold text-gray-600">Esperado</div><Json value={detail.finding.expected_json} /></div><div><div className="text-[11px] font-bold text-gray-600">Encontrado</div><Json value={detail.finding.actual_json} /></div></div>)}
          {detail.order && <div className="text-[11px]">Pedido <Mono>{detail.order.id}</Mono> · pagamento {detail.order.payment_status} · Escrow {detail.order.escrow_status} · {fmtMoney(detail.order.total_amount, detail.order.currency)}</div>}
          {detail.event && <div className="text-[11px]">Evento <Mono>{detail.event.id}</Mono> · <Badge cls={eventStatusClass(detail.event.status)}>{EVENT_STATUS_LABEL[detail.event.status]}</Badge> · {detail.event.attempts}/{detail.event.max_attempts} {detail.event.last_error_code ?? ''}</div>}
          <div className="grid md:grid-cols-2 gap-3 text-[11px]">
            <div><div className="font-bold text-gray-600 mb-1">Lançamentos do pedido</div>{detail.transactions.length === 0 ? <span className="text-gray-500">Nenhum.</span> : <ul className="space-y-0.5">{detail.transactions.map((t: any) => <li key={t.id}>{TX_TYPE_LABEL[t.type] ?? t.type} · <Mono>{t.id}</Mono></li>)}</ul>}</div>
            <div><div className="font-bold text-gray-600 mb-1">Eventos do pedido</div>{detail.events.length === 0 ? <span className="text-gray-500">Nenhum.</span> : <ul className="space-y-0.5">{detail.events.map((e: any) => <li key={e.id}>{TX_TYPE_LABEL[e.event_type] ?? e.event_type} · {EVENT_STATUS_LABEL[e.status] ?? e.status} · {e.attempts}</li>)}</ul>}</div>
          </div>
          {detail.finding.status === 'ACKNOWLEDGED' && <div className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-2">Reconhecida por <Mono>{detail.finding.acknowledged_by}</Mono>: {detail.finding.acknowledge_note}</div>}
          {isAdmin && detail.finding.status === 'OPEN' && <button className={btnPrimary} onClick={() => setAck(detail.finding.id)}>Reconhecer divergência</button>}
          {!isAdmin && <p className="text-[10px] text-gray-500">Reconhecer divergências é restrito ao Administrador Geral. A divergência continua visível até deixar de existir.</p>}
        </div>)}
      {ack && <ReasonModal title="Reconhecer divergência" min={10} confirmLabel="Reconhecer" hint="O reconhecimento NÃO resolve a divergência: ela continua visível, com seu nome e esta nota. Fica auditado." onCancel={() => setAck(null)}
        onConfirm={async (note) => { const r = await LedgerAdminApi.acknowledge(ack, note); if (!r.success) throw new Error(r.error?.message); showToast('Divergência reconhecida.'); setAck(null); setDetail(null); p.reload(); }} />}
    </div>
  );
};

// =================================================================================================================================================
// Chargebacks
// =================================================================================================================================================
interface LineDraft { orderId: string; partyType: '' | 'SELLER' | 'NUSALI' | 'THIRD_PARTY'; partyRef: string; amount: string; contractReference: string }
const ChargebacksView: React.FC<{ isAdmin: boolean; userId?: string; showToast: (m: string) => void }> = ({ isAdmin, userId, showToast }) => {
  const p = usePaged(LedgerAdminApi.chargebacks, { localStatus: '', orderId: '', id: '' });
  const [detail, setDetail] = useState<any>(null); const [dErr, setDErr] = useState<string | null>(null);
  const [form, setForm] = useState<null | 'evidence' | 'decision' | 'settle'>(null);
  const [reject, setReject] = useState<string | null>(null);
  const f = p.filters; const set = (k: string, v: string) => p.setFilters({ ...f, [k]: v });
  const open = async (id: string) => { setDErr(null); try { const r = await LedgerAdminApi.chargeback(id); if (!r.success) throw new Error(r.error?.message); setDetail(r.data); setForm(null); } catch (e) { setDErr(ledgerErrorMessage(e)); } };
  const refresh = async () => { if (detail) await open(detail.chargeback.id); p.reload(); };
  const approved = detail?.decisions?.find((d: any) => d.status === 'APPROVED');
  const [approveAsk, setApproveAsk] = useState<any>(null);
  const approve = async (id: string) => { const r = await LedgerAdminApi.approveDecision(id); if (!r.success) throw new Error(r.error?.message); showToast('Decisão aprovada e lançada no ledger sombra.'); setApproveAsk(null); await refresh(); };
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /><span>A responsabilidade nunca é atribuída automaticamente. Cada caso exige evidências, fundamentação, proposta e aprovação por um Administrador Geral diferente de quem propôs. A responsabilidade do vendedor é limitada ao valor líquido (N) do pedido (cumulativo). Nenhuma carteira é debitada: o valor do vendedor fica como recebível no ledger.</span></div>
      <div className={`${card} p-4 grid grid-cols-2 md:grid-cols-4 gap-2 items-end`}>
        <Field label="Estado do chargeback"><select className={input} value={f.localStatus} onChange={(e) => set('localStatus', e.target.value)}><option value="">Todos</option><option value="active">Contestação aberta</option><option value="lost">Perdido (debitado)</option><option value="reversed">Revertido</option><option value="manual_review">Revisão manual</option></select></Field>
        <Field label="Pedido"><input className={input} value={f.orderId} onChange={(e) => set('orderId', e.target.value)} /></Field>
        <Field label="Identificador"><input className={input} value={f.id} onChange={(e) => set('id', e.target.value)} /></Field>
        <button className={`${btnPrimary} flex items-center justify-center gap-1`} onClick={p.apply}><Search className="w-3.5 h-3.5" /> Filtrar</button>
      </div>
      <ErrorBox message={p.error} onRetry={p.reload} />
      <div className={`${card} p-3`}>
        {p.loading && !p.page ? <Loading /> : !p.page || p.page.items.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Atualizado</th><th>Provedor</th><th>Estado</th><th className="text-right">Valor</th><th>Alocações</th><th>Evidências</th><th>Decisão</th></tr></thead><tbody>
            {p.page.items.map((c: any) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-emerald-50 cursor-pointer" onClick={() => open(c.id)}>
                <td className="py-1.5 whitespace-nowrap">{fmtDate(c.updated_at)}</td><td><Mono>{c.provider_chargeback_id}</Mono></td><td>{c.local_status}</td><td className="text-right">{fmtMoney(c.value, c.currency)}</td><td>{c.allocations}</td><td>{c.evidence}</td><td>{c.latest_decision_status ? DECISION_STATUS_LABEL[c.latest_decision_status] ?? c.latest_decision_status : '—'}</td>
              </tr>))}
          </tbody></table></div>)}
        <Pager page={p.page} onOffset={p.setOffset} />
      </div>
      <ErrorBox message={dErr} />
      {detail && (
        <div className={`${card} p-4 space-y-4`}>
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-black text-sm text-gray-900">Chargeback <Mono>{detail.chargeback.provider_chargeback_id}</Mono></h3><div className="text-[11px] text-gray-500">Estado local <b>{detail.chargeback.local_status}</b> · provedor {detail.chargeback.provider_status} · {fmtMoney(detail.chargeback.value, detail.chargeback.currency)} · prazo de defesa {fmtDate(detail.chargeback.deadline_to_send_dispute_documents)}</div></div>
            <button className={btnGhost} onClick={() => setDetail(null)} aria-label="Fechar"><X className="w-3.5 h-3.5" /></button>
          </div>
          <section><h4 className="font-black text-xs text-gray-800 mb-1">Alocações por pedido (valor efetivamente debitado)</h4>
            {detail.allocations.length === 0 ? <Empty>Sem alocações: contestação ainda não perdida.</Empty> : (
              <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Pedido</th><th>Estágio</th><th className="text-right">Alocado</th><th className="text-right">Líquido do vendedor (N)</th><th>Lançamento</th></tr></thead><tbody>
                {detail.allocations.map((a: any) => (<tr key={a.id} className="border-t border-gray-100 align-top"><td className="py-1"><Mono>{a.order_id}</Mono></td><td>{STAGE_LABEL[a.release_stage]}{a.overlap_refund && <div><Badge cls="bg-rose-100 text-rose-800">Reembolso concluído: perda dobrada — nada lançado</Badge></div>}</td><td className="text-right">{fmtMoney(a.allocated_value, a.currency)}</td><td className="text-right">{fmtMoney(a.seller_net_amount, a.currency)}</td><td>{a.confirmed_transaction_id ? <Mono>{a.confirmed_transaction_id}</Mono> : '—'}</td></tr>))}
              </tbody></table></div>)}
          </section>
          <section><h4 className="font-black text-xs text-gray-800 mb-1">Evidências ({detail.evidence.length})</h4>
            {detail.evidence.length === 0 ? <Empty>Nenhuma evidência registrada.</Empty> : <ul className="space-y-1 text-[11px]">{detail.evidence.map((e: any) => <li key={e.id} className="border border-gray-100 rounded-lg p-2"><b>{e.kind}</b> · {fmtDate(e.created_at)} · <Mono>{e.added_by}</Mono> ({e.added_by_role})<div>{e.description}</div>{e.file_ref && <div>Arquivo: <Mono>{e.file_ref}</Mono></div>}{e.sha256 && <div>SHA-256: <Mono>{e.sha256}</Mono></div>}<div className="text-gray-400"><Mono>{e.id}</Mono></div></li>)}</ul>}
            <button className={`${btnGhost} mt-2`} onClick={() => setForm(form === 'evidence' ? null : 'evidence')}>Adicionar evidência</button>
            {form === 'evidence' && <EvidenceForm chargebackId={detail.chargeback.id} onDone={async () => { setForm(null); showToast('Evidência registrada.'); await refresh(); }} />}
          </section>
          <section><h4 className="font-black text-xs text-gray-800 mb-1">Decisões de responsabilidade (histórico imutável)</h4>
            {detail.decisions.length === 0 ? <Empty>Nenhuma decisão: a perda continua pendente de responsável.</Empty> : <div className="space-y-2">{detail.decisions.map((d: any) => (
              <div key={d.id} className="border border-gray-200 rounded-xl p-3 text-[11px] space-y-1">
                <div className="flex flex-wrap items-center gap-2"><b>v{d.version}</b><Badge cls={d.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : d.status === 'PROPOSED' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'}>{DECISION_STATUS_LABEL[d.status]}</Badge><span>{CAUSE_LABEL[d.cause_code] ?? d.cause_code}</span><span className="text-gray-500">proposta por <Mono>{d.proposed_by}</Mono>{d.approved_by && <> · aprovada por <Mono>{d.approved_by}</Mono> em {fmtDate(d.approved_at)}</>}</span></div>
                <div><b>Fundamentação:</b> {d.rationale}</div><div><b>Partes ouvidas:</b> {d.parties_heard}</div>{d.contract_basis && <div><b>Base contratual:</b> {d.contract_basis}</div>}{d.revision_reason && <div><b>Motivo da revisão:</b> {d.revision_reason}</div>}
                <table className="w-full"><tbody>{d.lines.map((l: any) => <tr key={l.id} className="border-t border-gray-100"><td className="py-0.5">{PARTY_LABEL[l.party_type]}{l.party_ref ? ` (${l.party_ref})` : ''}</td><td><Mono>{l.allocation_id}</Mono></td><td>{l.contract_reference ?? ''}</td><td className="text-right font-bold">{fmtMoney(l.amount, detail.chargeback.currency)}</td></tr>)}</tbody></table>
                {d.status === 'PROPOSED' && isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <button className={btnPrimary} disabled={d.proposed_by === userId} title={d.proposed_by === userId ? 'Quem propõe não pode aprovar' : ''} onClick={() => setApproveAsk(d)}>Aprovar e lançar</button>
                    <button className={btnDanger} onClick={() => setReject(d.id)}>Rejeitar</button>
                    {d.proposed_by === userId && <span className="text-[10px] text-gray-500 self-center">Você propôs esta decisão: outro Administrador Geral precisa aprová-la.</span>}
                  </div>)}
              </div>))}</div>}
            {detail.chargeback.local_status === 'lost' && detail.allocations.some((a: any) => a.release_stage === 'AFTER_RELEASE' && !a.overlap_refund) && !detail.decisions.some((d: any) => d.status === 'PROPOSED') && (
              <button className={`${btnGhost} mt-2`} onClick={() => setForm(form === 'decision' ? null : 'decision')}>{approved ? 'Propor revisão' : 'Propor decisão'}</button>)}
            {form === 'decision' && <DecisionForm detail={detail} revising={!!approved} onDone={async () => { setForm(null); showToast('Proposta registrada. Aguarda aprovação de outro Administrador Geral.'); await refresh(); }} />}
          </section>
          {approved && (<section><h4 className="font-black text-xs text-gray-800 mb-1">Recuperação / baixa de terceiro</h4>
            {detail.recoveries.length > 0 && <ul className="text-[11px] space-y-0.5 mb-2">{detail.recoveries.map((r: any) => <li key={r.id}>{fmtDate(r.created_at)} · {r.kind === 'RECOVERY' ? 'Recuperação' : 'Baixa'} · {r.party_ref} · {fmtMoney(r.amount, r.currency)} · {r.evidence_ref}</li>)}</ul>}
            {isAdmin ? (<><button className={btnGhost} onClick={() => setForm(form === 'settle' ? null : 'settle')}>Registrar recuperação ou baixa</button>
              {form === 'settle' && <SettleForm detail={detail} approved={approved} onDone={async () => { setForm(null); showToast('Registrado no ledger sombra.'); await refresh(); }} />}</>) : <p className="text-[10px] text-gray-500">Restrito ao Administrador Geral. A cobrança do vendedor pela carteira não existe: o valor dele permanece como recebível.</p>}
          </section>)}
        </div>)}
      {approveAsk && <ConfirmModal title="Aprovar e lançar decisão" confirmLabel="Aprovar e lançar" onCancel={() => setApproveAsk(null)} onConfirm={() => approve(approveAsk.id)}
        lines={[`Decisão v${approveAsk.version}: ${CAUSE_LABEL[approveAsk.cause_code] ?? approveAsk.cause_code}.`, ...approveAsk.lines.map((l: any) => `${PARTY_LABEL[l.party_type]}${l.party_ref ? ` (${l.party_ref})` : ''}: ${fmtMoney(l.amount, detail.chargeback.currency)}`), 'Grava lançamentos no ledger sombra (imutáveis). A parte do vendedor vira recebível: nenhuma carteira é debitada e nenhum dinheiro real é movimentado.']} />}
      {reject && <ReasonModal title="Rejeitar proposta" min={10} danger confirmLabel="Rejeitar" hint="A proposta ficará no histórico como rejeitada. Informe o motivo. Fica auditado." onCancel={() => setReject(null)}
        onConfirm={async (reason) => { const r = await LedgerAdminApi.rejectDecision(reject, reason); if (!r.success) throw new Error(r.error?.message); showToast('Proposta rejeitada.'); setReject(null); await refresh(); }} />}
    </div>
  );
};

const EvidenceForm: React.FC<{ chargebackId: string; onDone: () => Promise<void> }> = ({ chargebackId, onDone }) => {
  const [kind, setKind] = useState('PROOF_OF_DELIVERY'); const [description, setDescription] = useState(''); const [fileRef, setFileRef] = useState(''); const [sha256, setSha256] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const shaOk = !sha256.trim() || /^[0-9a-fA-F]{64}$/.test(sha256.trim());
  return (
    <div className="mt-2 border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <Field label="Tipo"><select className={input} value={kind} onChange={(e) => setKind(e.target.value)}><option value="PROOF_OF_DELIVERY">Comprovante de entrega</option><option value="TRACKING">Rastreio</option><option value="CUSTOMER_COMMUNICATION">Comunicação com o cliente</option><option value="SELLER_COUNTER_PROOF">Contra-prova do vendedor</option><option value="CARRIER_DOCUMENT">Documento da transportadora</option><option value="PROVIDER_DOCUMENT">Documento do provedor</option><option value="OTHER">Outro</option></select></Field>
        <Field label="Referência do arquivo (opcional)"><input className={input} value={fileRef} onChange={(e) => setFileRef(e.target.value)} /></Field>
      </div>
      <Field label="Descrição (mínimo 10 caracteres)"><textarea className={`${input} h-16`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="SHA-256 do arquivo (opcional, 64 caracteres)"><input className={input} value={sha256} onChange={(e) => setSha256(e.target.value)} /></Field>
      {!shaOk && <div className="text-[11px] text-rose-700 font-bold">SHA-256 inválido.</div>}
      <ErrorBox message={err} />
      <button className={btnPrimary} disabled={busy || !minLen(description, 10) || !shaOk} onClick={async () => { setBusy(true); setErr(null); try { const r = await LedgerAdminApi.addEvidence(chargebackId, { kind, description: description.trim(), fileRef: fileRef.trim() || undefined, sha256: sha256.trim().toLowerCase() || undefined }); if (!r.success) throw new Error(r.error?.message); await onDone(); } catch (e) { setErr(ledgerErrorMessage(e)); } finally { setBusy(false); } }}>{busy ? 'Enviando…' : 'Registrar evidência'}</button>
    </div>
  );
};

const DecisionForm: React.FC<{ detail: any; revising: boolean; onDone: () => Promise<void> }> = ({ detail, revising, onDone }) => {
  const targets = useMemo(() => detail.allocations.filter((a: any) => a.release_stage === 'AFTER_RELEASE' && !a.overlap_refund), [detail]);
  const [cause, setCause] = useState('INDETERMINATE'); const [causeDetail, setCauseDetail] = useState(''); const [rationale, setRationale] = useState(''); const [heard, setHeard] = useState(''); const [contractBasis, setContractBasis] = useState(''); const [revReason, setRevReason] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [lines, setLines] = useState<LineDraft[]>(() => targets.map((a: any) => ({ orderId: a.order_id, partyType: '' as const, partyRef: '', amount: '', contractReference: '' })));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const upd = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const addLine = (orderId: string) => setLines([...lines, { orderId, partyType: '', partyRef: '', amount: '', contractReference: '' }]);
  const sums = targets.map((a: any) => { const s = lines.filter((l) => l.orderId === a.order_id).reduce((acc, l) => acc + (parseMoney(l.amount) ? Number(parseMoney(l.amount)) : 0), 0); const sellerSum = lines.filter((l) => l.orderId === a.order_id && l.partyType === 'SELLER').reduce((acc, l) => acc + (parseMoney(l.amount) ? Number(parseMoney(l.amount)) : 0), 0); return { a, s, sellerSum, ok: Math.abs(s - Number(a.allocated_value)) < 0.005, capOk: a.seller_net_amount == null || sellerSum <= Number(a.seller_net_amount) + 0.005 }; });
  const valid = minLen(rationale, 30) && minLen(heard, 10) && evidenceIds.length > 0 && sums.every((x) => x.ok && x.capOk) && lines.every((l) => l.partyType !== '' && parseMoney(l.amount) && (l.partyType !== 'THIRD_PARTY' || (l.partyRef.trim() && minLen(l.contractReference, 5)))) && (!revising || minLen(revReason, 10));
  return (
    <div className="mt-2 border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="grid md:grid-cols-2 gap-2">
        <Field label="Causa"><select className={input} value={cause} onChange={(e) => setCause(e.target.value)}>{Object.keys(CAUSE_LABEL).map((c) => <option key={c} value={c}>{CAUSE_LABEL[c]}</option>)}</select></Field>
        <Field label="Detalhe da causa (opcional)"><input className={input} value={causeDetail} onChange={(e) => setCauseDetail(e.target.value)} /></Field>
      </div>
      <Field label={`Fundamentação (mínimo 30 caracteres) — ${rationale.trim().length}`}><textarea className={`${input} h-20`} value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
      <Field label="Partes ouvidas e quando (mínimo 10 caracteres)"><input className={input} value={heard} onChange={(e) => setHeard(e.target.value)} /></Field>
      <Field label="Base contratual (opcional)"><input className={input} value={contractBasis} onChange={(e) => setContractBasis(e.target.value)} /></Field>
      {revising && <Field label="Motivo da revisão (obrigatório)"><input className={input} value={revReason} onChange={(e) => setRevReason(e.target.value)} /></Field>}
      <div><div className="text-[11px] font-bold text-gray-600 mb-1">Evidências consideradas (ao menos uma)</div>
        {detail.evidence.length === 0 ? <div className="text-[11px] text-rose-700">Registre ao menos uma evidência antes de propor.</div> : detail.evidence.map((e: any) => (<label key={e.id} className="flex gap-2 text-[11px] items-start"><input type="checkbox" checked={evidenceIds.includes(e.id)} onChange={(ev) => setEvidenceIds(ev.target.checked ? [...evidenceIds, e.id] : evidenceIds.filter((x) => x !== e.id))} /><span><b>{e.kind}</b> — {e.description}</span></label>))}
      </div>
      {sums.map(({ a, s, sellerSum, ok, capOk }) => (
        <div key={a.id} className="border border-gray-100 rounded-lg p-2 space-y-1">
          <div className="text-[11px] font-bold text-gray-700">Pedido <Mono>{a.order_id}</Mono> — valor alocado {fmtMoney(a.allocated_value, a.currency)} · líquido do vendedor (N) {a.seller_net_amount != null ? fmtMoney(a.seller_net_amount, a.currency) : 'indisponível'}</div>
          {lines.map((l, i) => l.orderId !== a.order_id ? null : (
            <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-1 items-end">
              <select className={input} value={l.partyType} onChange={(e) => upd(i, { partyType: e.target.value as LineDraft['partyType'] })} aria-label="Parte"><option value="">Escolha a parte…</option><option value="SELLER">Vendedor</option><option value="NUSALI">Nusali</option><option value="THIRD_PARTY">Terceiro</option></select>
              <input className={input} placeholder="Valor" value={l.amount} onChange={(e) => upd(i, { amount: e.target.value })} aria-label="Valor" />
              {l.partyType === 'THIRD_PARTY' ? <input className={input} placeholder="Terceiro (identificação)" value={l.partyRef} onChange={(e) => upd(i, { partyRef: e.target.value })} /> : <span />}
              {l.partyType === 'THIRD_PARTY' ? <input className={input} placeholder="Referência contratual" value={l.contractReference} onChange={(e) => upd(i, { contractReference: e.target.value })} /> : <span />}
              <button className={btnGhost} onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Remover linha">Remover</button>
            </div>))}
          <button className={btnGhost} onClick={() => addLine(a.order_id)}>+ linha</button>
          <div className={`text-[11px] font-bold ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>Soma {fmtMoney(s, a.currency)} / {fmtMoney(a.allocated_value, a.currency)} {ok ? '✓' : '— precisa fechar exatamente'}</div>
          {!capOk && <div className="text-[11px] font-bold text-rose-700">O vendedor não pode responder por mais que o líquido (N). O excedente exige linha explícita (Nusali ou terceiro). O servidor também considera o que já foi atribuído em outras decisões do pedido.</div>}
          {sellerSum > 0 && capOk && <div className="text-[10px] text-gray-500">Vendedor: {fmtMoney(sellerSum, a.currency)} (recebível — nenhuma carteira é debitada).</div>}
        </div>))}
      <ErrorBox message={err} />
      <button className={btnPrimary} disabled={busy || !valid} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const r = await LedgerAdminApi.proposeDecision(detail.chargeback.id, { causeCode: cause, causeDetail: causeDetail.trim() || undefined, rationale: rationale.trim(), partiesHeard: heard.trim(), contractBasis: contractBasis.trim() || undefined, evidenceIds,
            lines: lines.map((l) => ({ orderId: l.orderId, partyType: l.partyType, partyRef: l.partyType === 'THIRD_PARTY' ? l.partyRef.trim() : undefined, contractReference: l.partyType === 'THIRD_PARTY' ? l.contractReference.trim() : undefined, amount: parseMoney(l.amount) })), revisionReason: revising ? revReason.trim() : undefined });
          if (!r.success) throw new Error(r.error?.message); await onDone();
        } catch (e) { setErr(ledgerErrorMessage(e)); } finally { setBusy(false); }
      }}>{busy ? 'Enviando…' : revising ? 'Propor revisão' : 'Propor decisão'}</button>
    </div>
  );
};

const SettleForm: React.FC<{ detail: any; approved: any; onDone: () => Promise<void> }> = ({ detail, approved, onDone }) => {
  const thirdLines = approved.lines.filter((l: any) => l.party_type === 'THIRD_PARTY');
  const [alloc, setAlloc] = useState(thirdLines[0]?.allocation_id ?? ''); const [kind, setKind] = useState<'RECOVERY' | 'WRITE_OFF'>('RECOVERY'); const [amount, setAmount] = useState('');
  const [evidenceRef, setEvidenceRef] = useState(''); const [reason, setReason] = useState(''); const [key] = useState(() => newIdempotencyKey('cb-settle'));
  const [ask, setAsk] = useState(false);
  if (thirdLines.length === 0) return <div className="mt-2 text-[11px] text-gray-600">A decisão aprovada não tem recebível de terceiro: não há o que recuperar ou baixar.</div>;
  const line = thirdLines.find((l: any) => l.allocation_id === alloc) ?? thirdLines[0];
  return (
    <div className="mt-2 border border-gray-200 rounded-xl p-3 space-y-2">
      <Field label="Recebível de terceiro"><select className={input} value={alloc} onChange={(e) => setAlloc(e.target.value)}>{thirdLines.map((l: any) => <option key={l.id} value={l.allocation_id}>{l.party_ref} — {fmtMoney(l.amount, detail.chargeback.currency)} ({l.allocation_id})</option>)}</select></Field>
      <div className="grid md:grid-cols-2 gap-2">
        <Field label="Tipo"><select className={input} value={kind} onChange={(e) => setKind(e.target.value as 'RECOVERY' | 'WRITE_OFF')}><option value="RECOVERY">Recuperação recebida</option><option value="WRITE_OFF">Baixa (reclamação rejeitada/prescrita)</option></select></Field>
        <Field label="Valor"><input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="Referência da evidência (obrigatória)"><input className={input} value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} /></Field>
      <Field label="Motivo (mínimo 10 caracteres)"><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <button className={btnPrimary} disabled={!parseMoney(amount) || !minLen(evidenceRef, 5) || !minLen(reason, 10)} onClick={() => setAsk(true)}>Registrar</button>
      {ask && <ConfirmModal title={kind === 'RECOVERY' ? 'Registrar recuperação' : 'Registrar baixa'} confirmLabel="Confirmar registro" onCancel={() => setAsk(false)}
        lines={[`Terceiro ${line.party_ref}: ${fmtMoney(parseMoney(amount) ?? 0, detail.chargeback.currency)} (${kind === 'RECOVERY' ? 'recuperação' : 'baixa'}).`, `Evidência: ${evidenceRef.trim()}`, 'Grava lançamento no ledger sombra (imutável). Não movimenta dinheiro real.']}
        onConfirm={async () => { const r = await LedgerAdminApi.settle(alloc, { kind, partyRef: line.party_ref, amount: parseMoney(amount)!, evidenceRef: evidenceRef.trim(), reason: reason.trim(), idempotencyKey: key }); if (!r.success) throw new Error(r.error?.message); setAsk(false); await onDone(); }} />}
    </div>
  );
};

// =================================================================================================================================================
// Reversão de custo de frete
// =================================================================================================================================================
const ShippingView: React.FC<{ isAdmin: boolean; showToast: (m: string) => void }> = ({ isAdmin, showToast }) => {
  const p = usePaged(LedgerAdminApi.shippingReversals, { orderId: '' });
  const [orderId, setOrderId] = useState(''); const [amount, setAmount] = useState(''); const [evidenceRef, setEvidenceRef] = useState(''); const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => newIdempotencyKey('ship-rev')); const [ask, setAsk] = useState(false);
  const f = p.filters;
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex gap-2"><Info /><span>Por padrão NADA é revertido: o subsídio da Nusali e o frete absorvido continuam sendo custo da Nusali. Registre uma reversão somente com evidência explícita de que a transportadora devolveu parte do custo, num pedido reembolsado por inteiro DEPOIS da liberação. Isto não movimenta dinheiro real.</span></div>
      <div className={`${card} p-4 flex gap-2 items-end`}>
        <Field label="Pedido"><input className={input} value={f.orderId} onChange={(e) => p.setFilters({ orderId: e.target.value })} /></Field>
        <button className={`${btnPrimary} flex items-center gap-1`} onClick={p.apply}><Search className="w-3.5 h-3.5" /> Filtrar</button>
      </div>
      <ErrorBox message={p.error} onRetry={p.reload} />
      <div className={`${card} p-3`}>
        {p.loading && !p.page ? <Loading /> : !p.page || p.page.items.length === 0 ? <Empty>Nenhuma reversão registrada.</Empty> : (
          <div className="overflow-x-auto"><table className={tbl}><thead><tr className="text-left text-gray-500"><th className="py-1">Quando</th><th>Pedido</th><th className="text-right">Valor</th><th className="text-right">Subsídio</th><th className="text-right">Frete absorvido</th><th>Evidência</th></tr></thead><tbody>
            {p.page.items.map((r: any) => (<tr key={r.id} className="border-t border-gray-100 align-top"><td className="py-1.5 whitespace-nowrap">{fmtDate(r.created_at)}</td><td><Mono>{r.order_id}</Mono></td><td className="text-right font-bold">{fmtMoney(r.amount, r.currency)}</td><td className="text-right">{fmtMoney(r.subsidy_part, r.currency)}</td><td className="text-right">{fmtMoney(r.absorbed_part, r.currency)}</td><td>{r.evidence_ref}<div className="text-[10px] text-gray-500">{r.reason}</div></td></tr>))}
          </tbody></table></div>)}
        <Pager page={p.page} onOffset={p.setOffset} />
      </div>
      {isAdmin ? (
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="font-black text-xs text-gray-800">Registrar reversão de custo de frete</h3>
          <div className="grid md:grid-cols-2 gap-2"><Field label="Pedido"><input className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} /></Field><Field label="Valor efetivamente devolvido"><input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
          <Field label="Referência da evidência (obrigatória, mínimo 5 caracteres)"><input className={input} value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} /></Field>
          <Field label="Motivo (mínimo 10 caracteres)"><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className={btnPrimary} disabled={!orderId.trim() || !parseMoney(amount) || !minLen(evidenceRef, 5) || !minLen(reason, 10)} onClick={() => setAsk(true)}>Registrar reversão</button>
          {ask && <ConfirmModal title="Registrar reversão de custo de frete" confirmLabel="Confirmar reversão" onCancel={() => setAsk(false)}
            lines={[`Pedido ${orderId.trim()}: ${fmtMoney(parseMoney(amount) ?? 0)} devolvidos pela transportadora.`, `Evidência: ${evidenceRef.trim()}`, 'Grava lançamento no ledger sombra (imutável) e é idempotente. Não movimenta dinheiro real.']}
            onConfirm={async () => { const r = await LedgerAdminApi.recordShippingReversal({ orderId: orderId.trim(), amount: parseMoney(amount)!, evidenceRef: evidenceRef.trim(), reason: reason.trim(), idempotencyKey: key }); if (!r.success) throw new Error(r.error?.message); showToast('Reversão de frete registrada.'); setAsk(false); setOrderId(''); setAmount(''); setEvidenceRef(''); setReason(''); setKey(newIdempotencyKey('ship-rev')); p.reload(); }} />}
        </div>) : <p className="text-[11px] text-gray-500">Registrar reversões de frete é restrito ao Administrador Geral.</p>}
    </div>
  );
};
const Info: React.FC = () => <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />;

// =================================================================================================================================================
export const AdminLedgerManager: React.FC<Props> = ({ showToast }) => {
  const { user } = useAuth();
  // Só UX: o servidor decide (ledgerAdminRoutes). Perfis sem acesso veem o aviso em vez de uma tela que falharia.
  if (!canReadLedger(user?.role)) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500" role="alert">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-amber-500 stroke-1" />
        <p className="font-black text-sm text-gray-800">Acesso restrito</p>
        <p className="text-xs mt-1">A gestão do ledger é restrita à Administração Global, ao Financeiro e à Análise de Risco.</p>
      </div>
    );
  }
  return <LedgerInner isAdmin={canAdminLedger(user?.role)} userId={user?.id} showToast={showToast} />;
};

const LedgerInner: React.FC<{ isAdmin: boolean; userId?: string; showToast: (m: string) => void }> = ({ isAdmin, userId, showToast }) => {
  const [tab, setTab] = useState<Tab>('summary');
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Scale className="w-6 h-6 text-emerald-600" /> Ledger Sombra — Gestão Contábil</h1>
          <p className="text-xs text-gray-500 mt-1">Consulta e acompanhamento dos lançamentos de dupla entrada. Somente leitura: lançamentos não podem ser editados nem apagados e nenhuma ação desta área movimenta dinheiro real.</p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> {isAdmin ? 'Administrador Geral — ações habilitadas' : 'Consulta e propostas'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (<button key={t.id} role="tab" aria-selected={tab === t.id} className={`${btn} ${tab === t.id ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`} onClick={() => setTab(t.id)}>{t.label}</button>))}
      </div>
      {tab === 'summary' && <SummaryView />}
      {tab === 'transactions' && <TransactionsView />}
      {tab === 'outbox' && <OutboxView isAdmin={isAdmin} showToast={showToast} />}
      {tab === 'findings' && <FindingsView isAdmin={isAdmin} showToast={showToast} />}
      {tab === 'chargebacks' && <ChargebacksView isAdmin={isAdmin} userId={userId} showToast={showToast} />}
      {tab === 'shipping' && <ShippingView isAdmin={isAdmin} showToast={showToast} />}
    </div>
  );
};
