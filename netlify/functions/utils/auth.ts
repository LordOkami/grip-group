import type { HandlerEvent } from '@netlify/functions';
import { getFirebaseAdminAuth } from './firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface TokenPayload {
  uid: string;
  email: string;
  emailVerified: boolean;
}

// Validate Firebase ID token
export async function validateToken(event: HandlerEvent): Promise<TokenPayload | null> {
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const auth = getFirebaseAdminAuth();
    const decodedToken: DecodedIdToken = await auth.verifyIdToken(token);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      emailVerified: decodedToken.email_verified || false,
    };
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}

// Get user ID from request
export async function getUserId(event: HandlerEvent): Promise<string | null> {
  const payload = await validateToken(event);
  return payload?.uid || null;
}

// Get user email from request
export async function getUserEmail(event: HandlerEvent): Promise<string | null> {
  const payload = await validateToken(event);
  return payload?.email || null;
}

// Check if user is admin
export async function isAdmin(event: HandlerEvent): Promise<boolean> {
  const email = await getUserEmail(event);
  if (!email) return false;

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}

// Forbidden response (for non-admin access)
export function forbiddenResponse() {
  return {
    statusCode: 403,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'No tienes permisos de administrador' })
  };
}

// Standard CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Unauthorized response
export function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Unauthorized' })
  };
}

// Error response
export function errorResponse(message: string, statusCode: number = 400) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: message })
  };
}

// Success response
export function successResponse(data: any, statusCode: number = 200) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(data)
  };
}
