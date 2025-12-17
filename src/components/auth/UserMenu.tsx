'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { logout } from '@/lib/auth/actions';

export function UserMenu() {
  const { user, isLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!user) {
    return null;
  }

  const userEmail = user.email || 'User';
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        title={userEmail}
      >
        {userInitial}
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown menu - positioned to the right of the sidebar */}
          <div className="absolute left-full bottom-0 ml-2 w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-50">
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                  {userInitial}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">{userEmail}</span>
                  <span className="text-xs text-muted-foreground">Signed in</span>
                </div>
              </div>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}








