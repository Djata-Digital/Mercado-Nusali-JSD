import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Search, X } from 'lucide-react';
import type { Category } from '../../utils/categoryUtils';
import {
  buildCategorySearchIndex, findCategoryEntry, INITIAL_PICKER_STATE, pickerReducer, pickerRows, resolveEnter,
  type CategoryEntry, type PickerState,
} from '../../utils/categorySearch';

interface Props {
  /** categorias ATIVAS (lista plana, como já chega ao cadastro de produtos) */
  categories: Category[];
  /** id da categoria escolhida (aceita também slug/nome, como o cadastro antigo guardava) */
  value: string;
  /** recebe o id da categoria FINAL escolhida, ou '' ao limpar */
  onChange: (categoryId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  /** só para testes: estado inicial (ex.: lista aberta) */
  initialState?: Partial<PickerState>;
}

/** caminho "Principal › Sub": ancestrais discretos e a própria categoria em destaque */
const PathLabel: React.FC<{ entry: CategoryEntry; strong?: boolean }> = ({ entry, strong }) => (
  <span className="block min-w-0">
    {entry.path.map((p, i) => (
      <React.Fragment key={p.id}>
        {i > 0 && <span aria-hidden="true" className="text-gray-400"> › </span>}
        <span className={i === entry.path.length - 1 ? (strong ? 'font-extrabold text-gray-900' : 'font-bold text-gray-900') : 'text-gray-500'}>{p.name}</span>
      </React.Fragment>
    ))}
  </span>
);

/**
 * Seletor de categoria pesquisável (padrão ARIA "combobox com listbox"): filtra enquanto se digita (nome, subcategoria e caminho; sem
 * diferenciar maiúsculas/acentos), mostra o caminho completo, navega por teclado (↑ ↓ Home End, Enter, Esc) e deixa explorar por
 * níveis sem digitar. Só categorias FINAIS são selecionáveis; as que têm subcategorias abrem.
 */
export const CategorySearchSelect: React.FC<Props> = ({ categories, value, onChange, loading, disabled, id = 'category-search', initialState }) => {
  const index = useMemo(() => buildCategorySearchIndex(categories), [categories]);
  const selected = useMemo(() => findCategoryEntry(index, value), [index, value]);
  const [state, dispatch] = useReducer((s: PickerState, a: Parameters<typeof pickerReducer>[1]) => pickerReducer(s, a, index), { ...INITIAL_PICKER_STATE, ...initialState });
  const view = useMemo(() => pickerRows(index, state), [index, state]);
  const listId = `${id}-listbox`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const browseParent = state.browseId ? index.byId.get(state.browseId) ?? null : null;
  const unavailable = !!loading || !!disabled || index.entries.length === 0;

  // fecha ao tocar/clicar fora (a lista fica dentro do componente; opções usam onMouseDown+preventDefault para não roubar o foco)
  useEffect(() => {
    if (!state.open) return;
    const onDown = (e: Event) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) dispatch({ type: 'close' }); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [state.open]);

  // mantém a linha ativa visível ao navegar por teclado
  useEffect(() => {
    if (!state.open || state.active < 0) return;
    document.getElementById(optionId(state.active))?.scrollIntoView?.({ block: 'nearest' });
  }, [state.open, state.active]);

  const choose = (entry: CategoryEntry) => {
    if (entry.isLeaf) {
      onChange(entry.id);
      dispatch({ type: 'close' });
    } else {
      dispatch({ type: 'drill', id: entry.id });
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!state.open) dispatch({ type: 'open', selectedParentId: selected?.parentId ?? null });
        dispatch({ type: 'move', delta: 1 });
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!state.open) dispatch({ type: 'open', selectedParentId: selected?.parentId ?? null });
        dispatch({ type: 'move', delta: -1 });
        break;
      case 'Home':
        if (state.open && view.rows.length > 0) { e.preventDefault(); dispatch({ type: 'first' }); }
        break;
      case 'End':
        if (state.open && view.rows.length > 0) { e.preventDefault(); dispatch({ type: 'last' }); }
        break;
      case 'Enter': {
        if (!state.open) break;
        e.preventDefault(); // Enter nunca envia o formulário do cadastro
        const result = resolveEnter(index, state);
        if (result.kind === 'select') { onChange(result.id); dispatch({ type: 'close' }); }
        else if (result.kind === 'drill') dispatch({ type: 'drill', id: result.id });
        break;
      }
      case 'Escape':
        if (state.open) { e.preventDefault(); e.stopPropagation(); dispatch({ type: 'close' }); }
        break;
      case 'Backspace':
        // campo vazio dentro de uma categoria: volta um nível
        if (state.open && (!state.typed || state.query === '') && state.browseId !== null) { e.preventDefault(); dispatch({ type: 'up' }); }
        break;
      case 'Tab':
        dispatch({ type: 'close' });
        break;
      default:
    }
  };

  const inputValue = state.typed ? state.query : (selected ? selected.pathLabel : '');
  const placeholder = loading ? 'Carregando categorias...' : index.entries.length === 0 ? 'Nenhuma categoria cadastrada no Admin' : 'Digite para pesquisar ou toque para explorar...';
  const activeId = state.open && state.active >= 0 && view.rows[state.active] ? optionId(state.active) : undefined;
  const announce = !state.open ? '' : view.mode === 'search'
    ? (view.total === 0 ? 'Nenhuma categoria encontrada.' : `${view.total} ${view.total === 1 ? 'categoria encontrada' : 'categorias encontradas'}.`)
    : `${view.rows.length} ${view.rows.length === 1 ? 'opção' : 'opções'} em ${browseParent ? browseParent.name : 'todas as categorias'}.`;

  return (
    <div ref={rootRef} className="relative" data-testid="category-search-select">
      <div className="relative">
        <Search aria-hidden="true" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={state.open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          disabled={unavailable}
          value={inputValue}
          placeholder={placeholder}
          onFocus={(e) => { if (!state.open && !unavailable) { dispatch({ type: 'open', selectedParentId: selected?.parentId ?? null }); e.target.select(); } }}
          onClick={() => { if (!state.open && !unavailable) dispatch({ type: 'open', selectedParentId: selected?.parentId ?? null }); }}
          onChange={(e) => dispatch({ type: 'input', value: e.target.value })}
          onKeyDown={onKeyDown}
          className="w-full min-h-[44px] pl-9 pr-10 py-2 border border-gray-300 rounded-xl bg-white text-base sm:text-sm font-medium focus:border-emerald-600 focus:outline-hidden disabled:opacity-60 disabled:bg-gray-50 truncate"
        />
        {selected && !unavailable && (
          <button
            type="button"
            aria-label="Limpar categoria escolhida"
            data-testid="category-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); dispatch({ type: 'close' }); inputRef.current?.focus(); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="sr-only">Digite para filtrar. Use as setas para percorrer, Enter para escolher e Esc para fechar. Só categorias finais podem ser escolhidas.</p>
      <div role="status" aria-live="polite" className="sr-only" data-testid="category-announce">{announce}</div>

      {state.open && (
        <div data-testid="category-panel" className="absolute left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {view.mode === 'browse' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-700">
              {browseParent ? (
                <button
                  type="button"
                  data-testid="category-up"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { dispatch({ type: 'up' }); inputRef.current?.focus(); }}
                  className="flex items-center gap-1 min-h-[36px] pr-2 text-emerald-700 hover:underline cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Voltar
                </button>
              ) : null}
              <span className="truncate" data-testid="category-browse-title">{browseParent ? browseParent.pathLabel : 'Todas as categorias'}</span>
            </div>
          )}
          {view.mode === 'search' && view.total > 0 && (
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500">
              {view.total} {view.total === 1 ? 'resultado' : 'resultados'}{view.total > view.rows.length ? ` — mostrando os ${view.rows.length} mais relevantes; digite mais para refinar` : ''}
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Categorias" className="max-h-[min(60vh,22rem)] overflow-y-auto overscroll-contain divide-y divide-gray-50">
            {view.rows.length === 0 && (
              <li role="presentation" data-testid="category-empty" className="px-3 py-4 text-sm text-gray-600">
                {view.mode === 'search' ? 'Nenhuma categoria encontrada. Tente outra palavra (o nome, a subcategoria ou o departamento).' : 'Nenhuma subcategoria.'}
              </li>
            )}
            {view.rows.map((row, i) => {
              const isActive = i === state.active;
              const isSelected = selected?.id === row.id;
              return (
                <li
                  key={row.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={row.isLeaf ? row.pathLabel : `${row.pathLabel}, com ${row.childCount} subcategorias. Abrir.`}
                  data-testid={row.isLeaf ? 'category-option-leaf' : 'category-option-branch'}
                  data-category-id={row.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => { if (!isActive) dispatch({ type: 'hover', index: i }); }}
                  onClick={() => choose(row)}
                  className={`flex items-center gap-2 px-3 py-2 min-h-[44px] cursor-pointer text-sm ${isActive ? 'bg-emerald-50' : 'bg-white'} ${isSelected ? 'border-l-4 border-emerald-600' : 'border-l-4 border-transparent'}`}
                >
                  <span className="flex-1 min-w-0">
                    {view.mode === 'search' || !browseParent ? <PathLabel entry={row} /> : <span className="font-bold text-gray-900">{row.name}</span>}
                    {!row.isLeaf && <span className="block text-[11px] text-gray-500">{row.childCount} {row.childCount === 1 ? 'subcategoria' : 'subcategorias'} — toque para abrir</span>}
                  </span>
                  {row.isLeaf
                    ? (isSelected ? <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" /> : null)
                    : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CategorySearchSelect;
