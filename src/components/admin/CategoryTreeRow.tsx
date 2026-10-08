import React from 'react';
import { Plus, Edit2, Trash2, FolderTree, CornerDownRight, ChevronRight, Sliders, Package } from 'lucide-react';
import type { Category } from '../../utils/categoryUtils';
import { findMatchRange, type TreeRow } from '../../utils/categoryTreeView';

/** Destaca o termo pesquisado dentro de um texto (sem dangerouslySetInnerHTML). */
export const Highlight: React.FC<{ text: string; query: string; enabled?: boolean }> = ({ text, query, enabled = true }) => {
  const r = enabled && query ? findMatchRange(text, query) : null;
  if (!r) return <>{text}</>;
  return (
    <>
      {text.slice(0, r[0])}
      <mark className="bg-yellow-200 text-gray-900 rounded-xs px-0.5">{text.slice(r[0], r[1])}</mark>
      {text.slice(r[1])}
    </>
  );
};

export interface CategoryRowProps {
  row: TreeRow;
  query: string;
  onToggle: (id: string) => void;
  onToggleActive: (c: Category) => void;
  onAttributes: (c: Category) => void;
  onAddSub: (c: Category) => void;
  onEdit: (c: Category) => void;
  onDelete: (id: string, name: string) => void;
}

/**
 * Uma linha da árvore de categorias. Layout em blocos (não em <table>): no desktop vira uma linha com colunas fixas
 * (categoria | produtos | comissão | estado | ações); no celular empilha, sem rolagem horizontal.
 * Memoizada: só re-renderiza quando a própria linha (ou o termo pesquisado) muda.
 */
export const CategoryRow = React.memo(
  ({ row, query, onToggle, onToggleActive, onAttributes, onAddSub, onEdit, onDelete }: CategoryRowProps) => {
    const { node, level, matched, hasChildren, open, auto, productsTotal } = row;
    const ownProducts = node.prods ?? 0;
    const slugSearch = /[-_]/.test(query);
    // Exclusão só faz sentido sem filhos e sem produtos; o servidor revalida (filhos, produtos, atributos, lojas e campanhas de frete).
    const deleteBlockedReason = hasChildren
      ? 'Esta categoria possui subcategorias. Exclua ou mova as subcategorias primeiro.'
      : ownProducts > 0
        ? 'Esta categoria possui produtos. Desative-a para preservar o histórico.'
        : '';
    const canToggle = hasChildren && !auto;

    return (
      <div
        role="treeitem"
        aria-level={level + 1}
        aria-expanded={hasChildren ? open : undefined}
        className={`border-b border-gray-100 hover:bg-purple-50/40 transition ${matched ? '' : 'bg-gray-50/70'}`}
      >
        <div className="flex flex-col @3xl:flex-row @3xl:flex-wrap @5xl:flex-nowrap @3xl:items-center gap-2 p-3">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 @3xl:min-w-[260px]" style={{ paddingLeft: `${level * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                disabled={auto}
                aria-label={`${open ? 'Recolher' : 'Expandir'} ${node.name}`}
                title={auto ? 'Aberta automaticamente pelo resultado da pesquisa/filtro' : open ? 'Recolher' : 'Expandir'}
                className="p-1.5 rounded-md hover:bg-purple-100 shrink-0 cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
              >
                <ChevronRight className={`w-4 h-4 text-purple-600 transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-6 shrink-0" aria-hidden="true" />
            )}
            {level > 0 ? (
              <CornerDownRight className="w-4 h-4 text-purple-400 shrink-0" />
            ) : (
              <FolderTree className="w-4 h-4 text-purple-600 shrink-0" />
            )}
            <div
              className={`min-w-0 ${canToggle ? 'cursor-pointer' : ''}`}
              onClick={canToggle ? () => onToggle(node.id) : undefined}
            >
              <div className="font-extrabold text-gray-900 text-xs flex flex-wrap items-center gap-1.5 break-words">
                <span>
                  <Highlight text={node.name} query={query} />
                </span>
                {hasChildren && (
                  <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md font-bold border border-purple-100">
                    {node.children.length} {node.children.length === 1 ? 'subcategoria' : 'subcategorias'}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 font-mono truncate">
                <Highlight text={node.slug || ''} query={query} enabled={slugSearch} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 @3xl:pl-0 @5xl:shrink-0 @5xl:flex-nowrap text-xs">
            <span
              className="font-bold text-gray-700 @5xl:w-[110px] flex items-center gap-1"
              title={hasChildren ? `Total desta categoria e das subcategorias (${ownProducts} diretamente nesta)` : 'Produtos ativos nesta categoria'}
            >
              <Package className="w-3.5 h-3.5 text-gray-400 @5xl:hidden" aria-hidden="true" />
              {productsTotal} {productsTotal === 1 ? 'produto' : 'produtos'}
            </span>
            <span className="font-black text-purple-700 @5xl:w-[110px]">
              {node.commissionRate !== null && node.commissionRate !== undefined ? (
                `${Number(node.commissionRate)}%`
              ) : (
                <span className="font-medium text-gray-400">Padrão do vendedor</span>
              )}
            </span>
            <button onClick={() => onToggleActive(node)} className="cursor-pointer @5xl:w-[70px] text-left" title="Clique para alterar o status">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                  node.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {node.isActive !== false ? 'Ativa' : 'Inativa'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-8 @3xl:pl-0 @3xl:w-full @3xl:justify-end @5xl:w-[330px] @5xl:shrink-0">
            <button
              onClick={() => onAttributes(node)}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer border border-indigo-200/60"
              title="Gerenciar atributos específicos desta categoria"
            >
              <Sliders className="w-3.5 h-3.5" /> Gerenciar Atributos
            </button>
            <button
              onClick={() => onAddSub(node)}
              className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Adicionar subcategoria sob esta categoria"
            >
              <Plus className="w-3.5 h-3.5" /> + Subcategoria
            </button>
            <button
              onClick={() => onEdit(node)}
              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
              title="Editar Categoria"
              aria-label={`Editar ${node.name}`}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(node.id, node.name)}
              disabled={!!deleteBlockedReason}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={deleteBlockedReason || 'Excluir Categoria'}
              aria-label={`Excluir ${node.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  },
  (a, b) =>
    a.row.node === b.row.node &&
    a.row.level === b.row.level &&
    a.row.matched === b.row.matched &&
    a.row.hasChildren === b.row.hasChildren &&
    a.row.open === b.row.open &&
    a.row.auto === b.row.auto &&
    a.row.productsTotal === b.row.productsTotal &&
    a.query === b.query &&
    a.onToggle === b.onToggle &&
    a.onToggleActive === b.onToggleActive &&
    a.onAttributes === b.onAttributes &&
    a.onAddSub === b.onAddSub &&
    a.onEdit === b.onEdit &&
    a.onDelete === b.onDelete
);
CategoryRow.displayName = 'CategoryRow';
