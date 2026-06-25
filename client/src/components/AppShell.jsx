import React from 'react';

export const shellClass =
  'relative flex min-h-screen items-center justify-center overflow-hidden px-[18px] py-6 sm:px-6';

export const ambientClass =
  'pointer-events-none fixed inset-0 opacity-40 before:absolute before:-left-36 before:-top-40 before:h-[30rem] before:w-[30rem] before:rounded-full before:bg-primary/10 before:blur-[130px] before:content-[""] after:absolute after:-bottom-48 after:-right-40 after:h-[30rem] after:w-[30rem] after:rounded-full after:bg-primary/5 after:blur-[130px] after:content-[""]';

export const cardClass =
  'mx-auto w-full rounded-md border border-outline bg-surface/95 px-[18px] pb-[18px] pt-[22px] shadow-panel sm:px-[26px] sm:pb-[22px] sm:pt-[26px]';

export const inputClass =
  'w-full rounded border border-white/10 bg-white/[0.03] px-3.5 py-3.5 text-text outline-none transition focus:border-primary/80 focus:ring-4 focus:ring-primary/20';

export const secondaryButtonClass =
  'rounded border border-white/[0.05] bg-surface-high px-4 py-3.5 text-text transition hover:bg-surface-highest disabled:cursor-default disabled:opacity-70';

function AppShell({ children, mainClassName = 'max-w-[620px]', rootClassName = '' }) {
  return (
    <div className={`${shellClass} ${rootClassName}`.trim()}>
      <div className={ambientClass} />
      <main className={`relative z-10 w-full ${mainClassName}`}>{children}</main>
    </div>
  );
}

export default AppShell;
