'use client';

import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Auth-aware navigation button.
 * In file-based mode (no Supabase Auth), always shows "Sign In".
 * Developer auth is handled via API keys, not browser cookies.
 */
export function AuthButton() {
  return (
    <Link href="/auth/login">
      <Button variant="outline" size="sm" className="gap-2">
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Sign In</span>
      </Button>
    </Link>
  );
}
