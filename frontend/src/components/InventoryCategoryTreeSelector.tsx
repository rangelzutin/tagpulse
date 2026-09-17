import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import type { CategoryTreeNode } from "../api/bi";
import { formatNumber } from "../utils/formatters";

export interface InventoryCategoryTreeSelectorProps {
  categories?: CategoryTreeNode[];
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
  initialOpen?: boolean;
}

interface FilteredTreeNode extends CategoryTreeNode {
  isMatch: boolean;
  filteredChildren: FilteredTreeNode[];
}

export function InventoryCategoryTreeSelector({
  categories = [],
  selectedCategorySourceId,
  onSelectCategorySourceId,
  initialOpen = false,
}: InventoryCategoryTreeSelectorProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [searchTerm, setSearchTerm] = useState("");
  // Inicialmente expande a raiz principal (1 - NINECLOUDS, sourceId "49")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set<string>(["49"]));
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Fecha com tecla Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Mapa rápido de busca de nós por sourceId
  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();
    function traverse(nodes: CategoryTreeNode[]) {
      for (const node of nodes) {
        map.set(node.sourceId, node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    }
    traverse(categories);
    return map;
  }, [categories]);

  // Total de produtos do catálogo
  const totalCatalogProducts = useMemo(() => {
    return categories.reduce((sum, root) => sum + root.descendantProductCount, 0);
  }, [categories]);

  const selectedNode = selectedCategorySourceId
    ? categoryMap.get(selectedCategorySourceId)
    : null;

  const displayText = selectedNode
    ? selectedNode.description
    : `Todas as categorias (${formatNumber(totalCatalogProducts)} produtos)`;

  // Filtragem e busca com preservação de ancestrais
  const { filteredTree, matchingIds, ancestorIds } = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matching = new Set<string>();
    const ancestors = new Set<string>();

    if (!term) {
      function wrapAll(nodes: CategoryTreeNode[]): FilteredTreeNode[] {
        return nodes.map((n) => ({
          ...n,
          isMatch: false,
          filteredChildren: wrapAll(n.children),
        }));
      }
      return {
        filteredTree: wrapAll(categories),
        matchingIds: matching,
        ancestorIds: ancestors,
      };
    }

    function searchNode(node: CategoryTreeNode, path: string[]): FilteredTreeNode | null {
      const isSelfMatch = node.description.toLowerCase().includes(term);
      if (isSelfMatch) {
        matching.add(node.sourceId);
        for (const ancId of path) {
          ancestors.add(ancId);
        }
      }

      const nextPath = [...path, node.sourceId];
      const filteredChildren: FilteredTreeNode[] = [];

      for (const child of node.children) {
        const childRes = searchNode(child, nextPath);
        if (childRes) {
          filteredChildren.push(childRes);
        }
      }

      if (isSelfMatch || filteredChildren.length > 0) {
        return {
          ...node,
          isMatch: isSelfMatch,
          filteredChildren,
        };
      }

      return null;
    }

    const filtered: FilteredTreeNode[] = [];
    for (const root of categories) {
      const res = searchNode(root, []);
      if (res) {
        filtered.push(res);
      }
    }

    return {
      filteredTree: filtered,
      matchingIds: matching,
      ancestorIds: ancestors,
    };
  }, [categories, searchTerm]);

  const toggleExpand = (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const handleSelect = (sourceId: string | null) => {
    onSelectCategorySourceId(sourceId);
    setIsOpen(false);
    setSearchTerm("");
  };

  // Renderizador recursivo de nós da árvore
  const renderNode = (node: FilteredTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isSelected = selectedCategorySourceId === node.sourceId;

    // Se houver busca, expande automaticamente ancestrais e matches
    const isExpanded = searchTerm
      ? ancestorIds.has(node.sourceId) || matchingIds.has(node.sourceId) || expandedIds.has(node.sourceId)
      : expandedIds.has(node.sourceId);

    const count = hasChildren ? node.descendantProductCount : node.directProductCount;
    const isZero = count === 0;

    return (
      <div key={node.sourceId} className="tp-tree-node-wrapper">
        <div
          className={`tp-combobox-option tp-tree-row ${isSelected ? "is-selected" : ""} ${
            node.isMatch ? "is-search-match" : ""
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          {/* Botão de Toggle Expand/Collapse ou espaçador */}
          {hasChildren ? (
            <button
              type="button"
              className="tp-tree-chevron-btn"
              onClick={(e) => toggleExpand(node.sourceId, e)}
              title={isExpanded ? "Recolher" : "Expandir"}
              aria-label={isExpanded ? `Recolher ${node.description}` : `Expandir ${node.description}`}
            >
              <ChevronRight
                size={13}
                className={`tp-tree-chevron-icon ${isExpanded ? "is-rotated" : ""}`}
              />
            </button>
          ) : (
            <span className="tp-tree-chevron-spacer" />
          )}

          {/* Nome da categoria clicável para selecionar */}
          <button
            type="button"
            className="tp-tree-select-btn"
            onClick={() => handleSelect(node.sourceId)}
            title={node.description}
          >
            <span className="tp-combobox-option-text tp-tree-text">
              {node.description}
            </span>
          </button>

          {/* Badge discreto de contagem de produtos */}
          <span className={`tp-tree-count-badge ${isZero ? "is-zero" : ""}`}>
            {formatNumber(count)} {count === 1 ? "prod." : "prod."}
          </span>

          {/* Ícone de Check se selecionado */}
          {isSelected && <Check size={14} className="tp-combobox-check-icon" />}
        </div>

        {/* Filhos renderizados se expandido */}
        {hasChildren && isExpanded && (
          <div className="tp-tree-children-container">
            {node.filteredChildren.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="tp-combobox-container tp-tree-selector-container"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* Botão de Trigger */}
      <button
        type="button"
        className={`tp-combobox-trigger tp-tree-trigger ${isOpen ? "is-open" : ""} ${
          selectedCategorySourceId !== null ? "is-filtered" : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={displayText}
      >
        <span className="tp-combobox-label">{displayText}</span>
        <ChevronDown size={14} className={`tp-combobox-chevron ${isOpen ? "is-rotated" : ""}`} />
      </button>

      {/* Popover flutuante */}
      {isOpen && (
        <div className="tp-combobox-popover tp-tree-popover" role="listbox">
          {/* Caixa de busca instantânea */}
          <div className="tp-combobox-search-wrap">
            <Search size={13} className="tp-combobox-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tp-combobox-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="tp-combobox-clear-btn"
                onClick={() => setSearchTerm("")}
                title="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Lista de opções */}
          <div className="tp-combobox-options-list tp-tree-options-list">
            {/* Opção "Todas as categorias" (visível se sem busca) */}
            {!searchTerm && (
              <button
                type="button"
                className={`tp-combobox-option tp-tree-all-option ${
                  selectedCategorySourceId === null ? "is-selected" : ""
                }`}
                onClick={() => handleSelect(null)}
              >
                <span className="tp-combobox-option-text">
                  Todas as categorias
                </span>
                <span className="tp-tree-count-badge">
                  {formatNumber(totalCatalogProducts)} prod.
                </span>
                {selectedCategorySourceId === null && (
                  <Check size={14} className="tp-combobox-check-icon" />
                )}
              </button>
            )}

            {filteredTree.length === 0 ? (
              <div className="tp-combobox-empty">
                Nenhuma categoria encontrada para &ldquo;{searchTerm}&rdquo;.
              </div>
            ) : (
              filteredTree.map((root) => renderNode(root, 0))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
