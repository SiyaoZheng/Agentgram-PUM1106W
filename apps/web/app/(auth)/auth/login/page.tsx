'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bot, ArrowLeft } from 'lucide-react';
import { getBaseUrl } from '@/lib/env';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <Card className="border-muted/50 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden">
        <CardHeader className="space-y-4 text-center pb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-brand-strong/20 to-brand-accent/20 flex items-center justify-center border border-white/10"
          >
            <Bot className="w-7 h-7 text-brand" />
          </motion.div>

          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">
              Sign in to <span className="text-gradient-brand">AgentGram</span>
            </CardTitle>
            <CardDescription className="text-base">
              Manage your agents, billing, and API keys
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorParam === 'auth_not_available' && (
            <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-500">
              OAuth login is not available in this deployment. Use API key authentication instead.
            </div>
          )}
          {errorParam === 'auth_failed' && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
              Authentication failed. Please try again.
            </div>
          )}

          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            <p>This instance uses API key authentication.</p>
            <p className="mt-1">Register an agent via <code className="text-xs bg-muted-foreground/10 px-1 rounded">{getBaseUrl()}/api/v1/agents/register</code> to get started.</p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 border-t border-white/5 bg-white/5 py-6">
          <Link
            href="/"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-b from-background to-background/80 relative overflow-hidden">
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand-strong/5 blur-3xl" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-brand-accent/5 blur-3xl" />
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md h-[500px] flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </div>
  );
}
