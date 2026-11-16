import { session, Session } from 'electron';

export interface CspDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'frame-src'?: string[];
  'worker-src'?: string[];
  'manifest-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

export function buildCspHeader(directives: CspDirectives): string {
  const parts: string[] = [];

  for (const [directive, values] of Object.entries(directives)) {
    if (directive === 'upgrade-insecure-requests' && values === true) {
      parts.push('upgrade-insecure-requests');
      continue;
    }
    if (directive === 'block-all-mixed-content' && values === true) {
      parts.push('block-all-mixed-content');
      continue;
    }
    if (Array.isArray(values) && values.length > 0) {
      parts.push(`${directive} ${values.join(' ')}`);
    }
  }

  return parts.join('; ');
}

const DEFAULT_CSP: CspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'http://127.0.0.1:11434',
    'http://127.0.0.1:7331',
    'ws://127.0.0.1:*',
    'wss://127.0.0.1:*',
  ],
  'media-src': ["'self'", 'blob:', 'data:'],
  'object-src': ["'none'"],
  'frame-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': true,
};

export function applyCspToSession(ses: Session = session.defaultSession, customCsp?: Partial<CspDirectives>): void {
  const mergedCsp: CspDirectives = {
    ...DEFAULT_CSP,
    ...customCsp,
    'connect-src': [
      ...(DEFAULT_CSP['connect-src'] || []),
      ...(customCsp?.['connect-src'] || []),
    ],
    'script-src': [
      ...(DEFAULT_CSP['script-src'] || []),
      ...(customCsp?.['script-src'] || []),
    ],
    'style-src': [
      ...(DEFAULT_CSP['style-src'] || []),
      ...(customCsp?.['style-src'] || []),
    ],
  };

  const cspHeader = buildCspHeader(mergedCsp);

  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    const newHeaders = {
      ...responseHeaders,
      'Content-Security-Policy': [cspHeader],
      'X-Content-Type-Options': ['nosniff'],
      'X-Frame-Options': ['DENY'],
      'X-XSS-Protection': ['1; mode=block'],
      'Referrer-Policy': ['strict-origin-when-cross-origin'],
      'Permissions-Policy': [
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
      ].join(', '),
    };

    callback({ responseHeaders: newHeaders });
  });
}

export function applyCspToWindow(webContents: Electron.WebContents, customCsp?: Partial<CspDirectives>): void {
  const mergedCsp: CspDirectives = {
    ...DEFAULT_CSP,
    ...customCsp,
    'connect-src': [
      ...(DEFAULT_CSP['connect-src'] || []),
      ...(customCsp?.['connect-src'] || []),
    ],
    'script-src': [
      ...(DEFAULT_CSP['script-src'] || []),
      ...(customCsp?.['script-src'] || []),
    ],
    'style-src': [
      ...(DEFAULT_CSP['style-src'] || []),
      ...(customCsp?.['style-src'] || []),
    ],
  };

  const cspHeader = buildCspHeader(mergedCsp);

  webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    const newHeaders = {
      ...responseHeaders,
      'Content-Security-Policy': [cspHeader],
      'X-Content-Type-Options': ['nosniff'],
      'X-Frame-Options': ['DENY'],
      'X-XSS-Protection': ['1; mode=block'],
      'Referrer-Policy': ['strict-origin-when-cross-origin'],
    };

    callback({ responseHeaders: newHeaders });
  });
}

export const SECURITY_HEADERS = {
  'Content-Security-Policy': buildCspHeader(DEFAULT_CSP),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};