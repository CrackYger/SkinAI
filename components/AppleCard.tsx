
import React from 'react';

export const AppleCard: React.FC<{ children: React.ReactNode, className?: string, dark?: boolean }> = ({ children, className = "", dark = false }) => (
  <div className={`rounded-[28px] shadow-sm border transition-colors duration-500 ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'} p-6 ${className}`}>
    {children}
  </div>
);

export const PrimaryButton: React.FC<{ onClick: () => void, children: React.ReactNode, disabled?: boolean, className?: string, dark?: boolean }> = ({ onClick, children, disabled, className = "", dark = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full py-4 px-6 ${dark ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'} font-bold rounded-2xl active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shadow-lg ${className}`}
  >
    {children}
  </button>
);

export const SecondaryButton: React.FC<{ onClick: () => void, children: React.ReactNode, className?: string, dark?: boolean }> = ({ onClick, children, className = "", dark = false }) => (
  <button
    onClick={onClick}
    className={`w-full py-4 px-6 ${dark ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-900'} font-bold rounded-2xl active:scale-95 transition-all ${className}`}
  >
    {children}
  </button>
);
