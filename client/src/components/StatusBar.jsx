import React from 'react';

const variants = {
  idle: 'bg-warning/10 text-warning',
  connecting: 'bg-warning/10 text-warning',
  connected: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
};

function StatusBar({ status, text }) {
  return (
    <div className={`inline-flex w-fit items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm ${variants[status]}`}>
      <span className="h-[9px] w-[9px] rounded-full bg-current" />
      <span>{text}</span>
    </div>
  );
}

export default StatusBar;
