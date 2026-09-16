import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

interface InventoryCategoryComboboxProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
}

export function InventoryCategoryCombobox({
  categories,
  selectedCategory,
  onSelectCategory,
}: InventoryCategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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
      // Foca no input ao abrir
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

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase().trim();
    return categories.filter((c) => c.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const handleSelect = (cat: string) => {
    onSelectCategory(cat);
    setIsOpen(false);
    setSearchTerm("");
  };

  const displayText =
    selectedCategory === "ALL"
      ? `Todas as categorias (${categories.length})`
      : selectedCategory;

  return (
    <div
      className="tp-combobox-container"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* Botão de Trigger */}
      <button
        type="button"
        className={`tp-combobox-trigger ${isOpen ? "is-open" : ""} ${
          selectedCategory !== "ALL" ? "is-filtered" : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={displayText}
      >
        <span className="tp-combobox-label">{displayText}</span>
        <ChevronDown size={14} className={`tp-combobox-chevron ${isOpen ? "is-rotated" : ""}`} />
      </button>

      {/* Popover / Dropdown flutuante */}
      {isOpen && (
        <div className="tp-combobox-popover" role="listbox">
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

          {/* Lista de opções rolável */}
          <div className="tp-combobox-options-list">
            {/* Opção Todas as categorias */}
            {!searchTerm && (
              <button
                type="button"
                className={`tp-combobox-option ${
                  selectedCategory === "ALL" ? "is-selected" : ""
                }`}
                onClick={() => handleSelect("ALL")}
                role="option"
                aria-selected={selectedCategory === "ALL"}
              >
                <span className="tp-combobox-option-text">
                  Todas as categorias ({categories.length})
                </span>
                {selectedCategory === "ALL" && (
                  <Check size={14} className="tp-combobox-check-icon" />
                )}
              </button>
            )}

            {filteredCategories.length === 0 ? (
              <div className="tp-combobox-empty">
                Nenhuma categoria encontrada
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`tp-combobox-option ${
                      isSelected ? "is-selected" : ""
                    }`}
                    onClick={() => handleSelect(cat)}
                    role="option"
                    aria-selected={isSelected}
                    title={cat}
                  >
                    <span className="tp-combobox-option-text">{cat}</span>
                    {isSelected && (
                      <Check size={14} className="tp-combobox-check-icon" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
