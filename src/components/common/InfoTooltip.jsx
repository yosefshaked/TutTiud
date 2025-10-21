import React, { useState, useRef, useEffect, useId } from 'react';
import ReactDOM from 'react-dom';

export function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const id = useId();

  const computePosition = () => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const offset = 8;
    const rect = trigger.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;
    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';
    const ttRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + offset;
    let left = rect.left;
    if (top + ttRect.height > innerHeight) {
      top = rect.top - ttRect.height - offset;
    }
    const dir = document.dir === 'rtl' ? 'rtl' : 'ltr';
    if (dir === 'rtl') {
      left = rect.right - ttRect.width;
    }
    if (left + ttRect.width > innerWidth) {
      left = innerWidth - ttRect.width - offset;
    }
    if (left < offset) left = offset;
    setStyle({ top, left });
    tooltip.style.visibility = '';
    tooltip.style.display = 'block';
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    computePosition();
    const handleClick = (e) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target) &&
        !triggerRef.current.contains(e.target)
      ) {
        close();
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const handleScroll = () => close();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) computePosition();
  }, [open]);

  const tooltip = open ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      id={id}
      style={{ position: 'fixed', zIndex: 9999, top: style.top, left: style.left }}
      className="max-w-xs bg-white rounded shadow-lg p-3 text-sm text-slate-700 border border-slate-200"
    >
      {text}
    </div>
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold cursor-help border border-slate-300"
      >
        ?
      </span>
      {open && ReactDOM.createPortal(tooltip, document.body)}
    </>
  );
}
