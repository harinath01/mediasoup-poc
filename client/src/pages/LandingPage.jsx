import React from 'react';
import { Link } from 'react-router-dom';
import AppShell, { cardClass } from '../components/AppShell.jsx';
import { ArrowIcon, StaffIcon, StudentIcon } from '../components/icons.jsx';

function LandingPage() {
  return (
    <AppShell>
      <div className="mb-5 text-center">
        <h1 className="m-0 text-[1.55rem] font-extrabold tracking-brand text-primary">ProctorLive</h1>
      </div>

      <section className={`${cardClass} max-w-[500px]`}>
        <div className="grid gap-[13px]">
          <Link
            className="flex min-h-[84px] items-center justify-between gap-3 rounded bg-primary px-5 py-[18px] text-white shadow-action transition hover:bg-primary-strong hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            to="/student"
          >
            <span className="flex items-center gap-4">
              <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded bg-white/10">
                <StudentIcon />
              </span>
              <span className="text-base font-bold tracking-[-0.03em]">Join as Student</span>
            </span>
            <span className="inline-flex items-center justify-center opacity-90">
              <ArrowIcon />
            </span>
          </Link>

          <Link
            className="flex min-h-[84px] items-center justify-between gap-3 rounded border border-white/[0.035] bg-surface-high px-5 py-[18px] text-text transition hover:bg-surface-highest hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            to="/staff"
          >
            <span className="flex items-center gap-4">
              <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded bg-white/[0.04] text-muted">
                <StaffIcon />
              </span>
              <span className="text-base font-bold tracking-[-0.03em]">Join as Staff</span>
            </span>
            <span className="inline-flex items-center justify-center opacity-90">
              <ArrowIcon />
            </span>
          </Link>
        </div>

        <div className="mt-[26px] border-t border-white/[0.035] pt-[18px]">
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-muted/75">System ID</div>
          <div className="mt-[5px] font-mono text-[0.9rem] text-text">PL-2024-X9</div>
        </div>
      </section>
    </AppShell>
  );
}

export default LandingPage;
