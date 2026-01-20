import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getFirestoreDb } from './utils/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
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
  const userId = await getUserId(event);
  if (!userId) {
    return unauthorizedResponse();
  }

  // Check admin permission
  if (!(await isAdmin(event))) {
    return forbiddenResponse();
  }

  const db = getFirestoreDb();
  const settingsRef = db.collection('settings').doc('registration');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        // Get registration settings
        const settingsDoc = await settingsRef.get();

        // If no settings exist, return defaults
        const settings = settingsDoc.exists
          ? { id: settingsDoc.id, ...settingsDoc.data() }
          : {
              id: 'registration',
              registrationOpen: true,
              maxTeams: 35,
              registrationDeadline: null,
              pilotModificationDeadline: null,
              eventDate: null,
              eventLocation: null
            };

        return successResponse({ settings });
      }

      case 'PUT': {
        const body = JSON.parse(event.body || '{}');

        // Build update object with only allowed fields
        const allowedFields = [
          'registrationOpen',
          'maxTeams',
          'registrationDeadline',
          'pilotModificationDeadline',
          'eventDate',
          'eventLocation'
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

        updates.updatedAt = FieldValue.serverTimestamp();

        // Check if settings document exists
        const settingsDoc = await settingsRef.get();

        if (settingsDoc.exists) {
          // Update existing
          await settingsRef.update(updates);
        } else {
          // Create new with defaults
          await settingsRef.set({
            registrationOpen: true,
            maxTeams: 35,
            registrationDeadline: null,
            pilotModificationDeadline: null,
            eventDate: null,
            eventLocation: null,
            ...updates
          });
        }

        const updatedDoc = await settingsRef.get();

        return successResponse({ settings: { id: updatedDoc.id, ...updatedDoc.data() } });
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
