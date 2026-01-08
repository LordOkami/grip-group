import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { supabase } from './utils/supabase';
import {
  getUserId,
  isAdmin,
  corsHeaders,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse
} from './utils/auth';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Validate authentication
  const userId = getUserId(event);
  if (!userId) {
    return unauthorizedResponse();
  }

  // Check admin permission
  if (!isAdmin(event)) {
    return forbiddenResponse();
  }

  try {
    switch (event.httpMethod) {
      case 'GET': {
        // Get registration settings
        const { data, error } = await supabase
          .from('registration_settings')
          .select('*')
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        // If no settings exist, return defaults
        const settings = data || {
          registration_open: true,
          max_teams: 35,
          registration_deadline: null,
          event_date: null,
          event_location: null
        };

        return successResponse({ settings });
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}');

        // Build update object with only allowed fields
        const allowedFields = [
          'registration_open',
          'max_teams',
          'registration_deadline',
          'pilot_modification_deadline',
          'event_date',
          'event_location'
        ];

        const updates: Record<string, any> = {};
        for (const field of allowedFields) {
          if (body[field] !== undefined) {
            updates[field] = body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return errorResponse('No valid fields to update');
        }

        // Check if settings row exists
        const { data: existing } = await supabase
          .from('registration_settings')
          .select('id')
          .single();

        let data;
        let error;

        if (existing) {
          // Update existing
          const result = await supabase
            .from('registration_settings')
            .update(updates)
            .eq('id', existing.id)
            .select()
            .single();
          data = result.data;
          error = result.error;
        } else {
          // Insert new
          const result = await supabase
            .from('registration_settings')
            .insert(updates)
            .select()
            .single();
          data = result.data;
          error = result.error;
        }

        if (error) throw error;

        return successResponse({ settings: data });
      }

      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error: any) {
    console.error('Admin Settings Error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
};

export { handler };
