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
        // Get all teams with pilots and staff counts
        const { data, error } = await supabase
          .from('teams')
          .select(`
            *,
            pilots (id, name, surname, email, driving_level, is_representative),
            team_staff (id, name, role)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Add counts to each team
        const teamsWithCounts = data?.map(team => ({
          ...team,
          pilots_count: team.pilots?.length || 0,
          staff_count: team.team_staff?.length || 0
        }));

        // Calculate stats
        const stats = {
          total: teamsWithCounts?.length || 0,
          draft: teamsWithCounts?.filter(t => t.status === 'draft').length || 0,
          pending: teamsWithCounts?.filter(t => t.status === 'pending').length || 0,
          confirmed: teamsWithCounts?.filter(t => t.status === 'confirmed').length || 0,
          total_pilots: teamsWithCounts?.reduce((sum, t) => sum + t.pilots_count, 0) || 0,
          total_staff: teamsWithCounts?.reduce((sum, t) => sum + t.staff_count, 0) || 0
        };

        return successResponse({ teams: teamsWithCounts, stats });
      }

      case 'PUT': {
        // Update team status
        const teamId = event.queryStringParameters?.id;
        if (!teamId) {
          return errorResponse('Team ID is required');
        }

        const body = JSON.parse(event.body || '{}');

        // Only allow status updates from admin
        const allowedUpdates: Record<string, any> = {};
        if (body.status && ['draft', 'pending', 'confirmed', 'cancelled'].includes(body.status)) {
          allowedUpdates.status = body.status;
        }

        if (Object.keys(allowedUpdates).length === 0) {
          return errorResponse('No valid fields to update');
        }

        const { data, error } = await supabase
          .from('teams')
          .update(allowedUpdates)
          .eq('id', teamId)
          .select()
          .single();

        if (error) throw error;

        return successResponse({ team: data });
      }

      case 'DELETE': {
        // Delete team
        const teamId = event.queryStringParameters?.id;
        if (!teamId) {
          return errorResponse('Team ID is required');
        }

        const { error } = await supabase
          .from('teams')
          .delete()
          .eq('id', teamId);

        if (error) throw error;

        return successResponse({ message: 'Team deleted successfully' });
      }

      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error: any) {
    console.error('Admin Teams Error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
};

export { handler };
