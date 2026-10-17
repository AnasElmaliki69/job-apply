'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Reveal({ open, children, id }: { open:boolean; children:ReactNode; id?:string }) {
  return <div className="disclosure" data-open={open}><div id={id} className="disclosure-panel" inert={!open} aria-hidden={!open}><div className="disclosure-content">{children}</div></div></div>;
}

// Grid tracks animate natural content height, with no fixed max-height or JS timer.
// Initial restored state is applied on mount, so restoration never waits for motion.
export function Disclosure({ label, children, open: controlled, defaultOpen = false, onOpenChange, className = '', triggerClassName = '', id }: {
  label: ReactNode; children: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
  className?: string; triggerClassName?: string; id?: string;
}) {
  const generatedId = useId(); const panelId = id ?? generatedId;
  const [localOpen,setLocalOpen] = useState(defaultOpen); const open = controlled ?? localOpen;
  const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null);
  function toggle() {
    if (open && panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll:true });
    if (controlled === undefined) setLocalOpen(!open);
    onOpenChange?.(!open);
  }
  return <div className={`disclosure ${className}`} data-open={open}>
    <button ref={trigger} type="button" className={`disclosure-trigger flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left ${triggerClassName}`} aria-expanded={open} aria-controls={panelId} onClick={toggle} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); toggle(); } }}>
      <span>{label}</span><ChevronDown size={15} aria-hidden="true" className="disclosure-chevron shrink-0"/>
    </button>
    <div ref={panel} id={panelId} className="disclosure-panel" inert={!open} aria-hidden={!open} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); toggle(); } }}><div className="disclosure-content">{children}</div></div>
  </div>;
}
