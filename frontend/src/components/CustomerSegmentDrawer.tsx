import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { CustomerRecencyBucket, CustomerSegmentType } from "../api/bi";
import {
  CustomerSegmentView,
  type RateContextData,
} from "./CustomerSegmentView";
import { CustomerDetailView } from "./CustomerDetailView";

export interface CustomerSegmentDrawerProps {
  isOpen: boolean;
  initialMode: "segment" | "detail";
  segment: CustomerSegmentType | null;
  recencyBucket?: CustomerRecencyBucket | null;
  customerId: string | null;
  from: string;
  to: string;
  periodMode?: "range" | "allUpTo";
  rateContext?: RateContextData | null;
  canGoBackToSegment?: boolean;
  onClose: () => void;
}

export function CustomerSegmentDrawer({
  isOpen,
  initialMode,
  segment,
  recencyBucket,
  customerId,
  from,
  to,
  periodMode = "range",
  rateContext,
  canGoBackToSegment = false,
  onClose,
}: CustomerSegmentDrawerProps) {
  const [mode, setMode] = useState<"segment" | "detail">(initialMode);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    customerId,
  );
  const [canGoBack, setCanGoBack] = useState(canGoBackToSegment);

  // Sync state when props change
  useEffect(() => {
    setMode(initialMode);
    setSelectedCustomerId(customerId);
    setCanGoBack(canGoBackToSegment);
  }, [initialMode, customerId, canGoBackToSegment, isOpen]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectCustomerFromList = (cId: string) => {
    setSelectedCustomerId(cId);
    setMode("detail");
    setCanGoBack(true);
  };

  const handleBackToSegment = () => {
    setMode("segment");
  };

  return (
    <div
      className="tp-drawer-backdrop"
      onClick={(e) => {
        // Close if clicking the overlay outside the drawer
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Painel de detalhamento de clientes"
    >
      <aside className="tp-drawer-container">
        {/* Top Control Bar */}
        <div className="tp-drawer-top-bar">
          <div className="tp-drawer-top-left">
            {mode === "detail" && canGoBack && (
              <button
                type="button"
                className="tp-drawer-back-btn"
                onClick={handleBackToSegment}
                aria-label="Voltar para a lista de clientes"
              >
                <ArrowLeft size={14} />
                <span>Voltar para a lista</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className="tp-drawer-close-btn"
            onClick={onClose}
            aria-label="Fechar painel lateral"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="tp-drawer-body">
          {mode === "segment" && segment && (
            <CustomerSegmentView
              segment={segment}
              recencyBucket={recencyBucket}
              from={from}
              to={to}
              rateContext={rateContext}
              onSelectCustomer={handleSelectCustomerFromList}
            />
          )}

          {mode === "detail" && selectedCustomerId && (
            <CustomerDetailView
              customerId={selectedCustomerId}
              from={from}
              to={to}
              periodMode={periodMode}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
