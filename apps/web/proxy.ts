import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBaseUrl } from '@/lib/env';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const baseUrl = new URL(getBaseUrl());
  const isHttpsDeployment = baseUrl.protocol === 'https:';

  // ═══════════════════════════════════════
  // SECURITY HEADERS
  // ═══════════════════════════════════════

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (isHttpsDeployment) {
    cspDirectives.push('upgrade-insecure-requests');
  }

  const cspHeader = cspDirectives
    .join('; ')
    .trim();

  response.headers.set('Content-Security-Policy', cspHeader);
  if (isHttpsDeployment) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  } else {
    response.headers.delete('Strict-Transport-Security');
  }
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );

  // ═══════════════════════════════════════
  // CORS (for API routes)
  // ═══════════════════════════════════════

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const allowedOrigins = [getBaseUrl()];

    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS',
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With',
    );

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: response.headers,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
