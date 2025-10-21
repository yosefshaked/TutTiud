import React, { useCallback, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useOrg } from './OrgContext.jsx';

export default function OrgSwitcher() {
  const { organizations, activeOrg, selectOrg } = useOrg();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const handleSelect = async (orgId) => {
    await selectOrg(orgId);
    close();
  };

  if (!organizations.length) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget)) {
            close();
          }
        }}
        className="flex items-center justify-between gap-2 w-full bg-white border border-slate-200 hover:border-blue-400 text-right rounded-xl px-3 py-2 transition"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Building2 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">ארגון פעיל</span>
            <span className="text-sm font-semibold text-slate-900 truncate max-w-[180px]">
              {activeOrg?.name || 'לא נבחר ארגון'}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute z-20 mt-2 right-0 w-full max-w-xs bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {organizations.map((org) => {
            const isActive = org.id === activeOrg?.id;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSelect(org.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="truncate text-right">{org.name}</span>
                {isActive ? <Check className="w-4 h-4" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
