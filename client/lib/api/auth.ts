/**
 * Authentication & Authorization Middleware
 * Provides utilities for protecting API routes and checking user permissions
 */

import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApiErrors } from './errors'
import { RequestContext } from './types'

/**
 * Get authenticated user from request
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw ApiErrors.unauthorized('Invalid or expired session')
  }

  return user
}

/**
 * Create request context from request
 */
export function createRequestContext(request: NextRequest, userId?: string): RequestContext {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'

  return {
    userId,
    requestId,
    ip,
    userAgent,
    timestamp: new Date(),
  }
}

/**
 * Require authentication middleware
 * Throws if user is not authenticated
 */
export async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  return user
}

/**
 * Require specific role/permission
 * Gets role from authoritative backend source instead of metadata
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[]
) {
  const user = await getAuthenticatedUser(request)
  
  // Get the auth token from the request
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiErrors.unauthorized('No auth token available')
  }

  // Get role from authoritative backend source
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/role`, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw ApiErrors.forbidden('Unable to verify user role')
  }

  const { role } = await response.json()
  
  if (!allowedRoles.includes(role)) {
    throw ApiErrors.forbidden(`Requires one of: ${allowedRoles.join(', ')}`)
  }

  return user
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

/**
 * Check if user owns resource
 * Helper for resource-level authorization
 */
export function checkOwnership(userId: string, resourceUserId: string) {
  if (userId !== resourceUserId) {
    throw ApiErrors.forbidden('You do not have permission to access this resource')
  }
}

/**
 * API Route Handler with Authentication
 * Wrapper for authenticated API routes
 */
export function withAuth<T extends unknown[]>(
  handler: (request: NextRequest, user: Awaited<ReturnType<typeof getAuthenticatedUser>>, ...args: T) => Promise<Response>,
  options?: {
    requireRole?: string[]
  }
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    let user = await getAuthenticatedUser(request)
    
    if (options?.requireRole) {
      user = await requireRole(request, options.requireRole)
    }

    return handler(request, user, ...args)
  }
}

