import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const ListModal = ({ isOpen, onClose, title, icon: Icon, children }) => {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sports-dark overflow-hidden animate-slide-up" style={{ isolation: 'isolate' }}>
      {/* Header (Full Width Fixed) */}
      <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-sports-secondary/30 bg-sports-card/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {Icon && <Icon size={24} className="text-sports-accent" />}
          <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-widest">{title}</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-xl text-sports-muted hover:text-white hover:bg-sports-secondary transition-colors"
        >
          <X size={28} />
        </button>
      </div>
      
      {/* Scrollable Body (Takes Remaining Space) */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default ListModal;
