import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getFirestoreDb } from './utils/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getUserId,
  corsHeaders,
  unauthorizedResponse,
  errorResponse,
  successResponse
} from './utils/auth';

const MAX_STAFF = 4;

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

  const db = getFirestoreDb();

  // Get user's team
  const teamQuery = await db.collection('teams')
    .where('representativeUserId', '==', userId)
    .limit(1)
    .get();

  if (teamQuery.empty) {
    return errorResponse('Primero debes crear un equipo / You must create a team first', 400);
  }

  const teamDoc = teamQuery.docs[0];
  const staffRef = teamDoc.ref.collection('staff');

  // Get staff ID from query string for PUT/DELETE
  const staffId = event.queryStringParameters?.id;

  try {
    switch (event.httpMethod) {
      case 'GET': {
        // Get all staff for the team
        const staffSnapshot = await staffRef.orderBy('createdAt').get();
        const staff = staffSnapshot.docs.map(doc => ({
          id: doc.id,
          teamId: teamDoc.id,
          ...doc.data()
        }));

        return successResponse({ staff });
      }

      case 'POST': {
        // Add new staff member
        const body = JSON.parse(event.body || '{}');

        // Check staff count
        const staffCount = await staffRef.count().get();
        const count = staffCount.data().count;

        if (count >= MAX_STAFF) {
          return errorResponse(
            `El equipo ya tiene el máximo de staff (${MAX_STAFF}) / Team already has maximum staff (${MAX_STAFF})`
          );
        }

        // Validate required fields
        if (!body.name || !body.role) {
          return errorResponse('Nombre y rol son obligatorios / Name and role are required');
        }

        // Validate role
        const validRoles = ['mechanic', 'coordinator', 'support'];
        if (!validRoles.includes(body.role)) {
          return errorResponse('Rol inválido / Invalid role');
        }

        // Create staff member
        const now = FieldValue.serverTimestamp();
        const staffDocRef = staffRef.doc();

        const staffData = {
          teamId: teamDoc.id,
          name: body.name,
          dni: body.dni || '',
          phone: body.phone || '',
          role: body.role,
          createdAt: now,
          updatedAt: now
        };

        await staffDocRef.set(staffData);

        return successResponse({ staff: { id: staffDocRef.id, ...staffData } }, 201);
      }

      case 'PUT': {
        // Update staff member
        if (!staffId) {
          return errorResponse('Staff ID required');
        }

        const body = JSON.parse(event.body || '{}');

        // Verify staff exists in team
        const staffDoc = await staffRef.doc(staffId).get();
        if (!staffDoc.exists) {
          return errorResponse('Staff no encontrado / Staff not found', 404);
        }

        // Validate role if provided
        if (body.role) {
          const validRoles = ['mechanic', 'coordinator', 'support'];
          if (!validRoles.includes(body.role)) {
            return errorResponse('Rol inválido / Invalid role');
          }
        }

        // Remove fields that shouldn't be updated
        delete body.id;
        delete body.teamId;
        delete body.createdAt;

        // Add updated timestamp
        body.updatedAt = FieldValue.serverTimestamp();

        await staffDoc.ref.update(body);

        const updatedDoc = await staffDoc.ref.get();

        return successResponse({ staff: { id: updatedDoc.id, teamId: teamDoc.id, ...updatedDoc.data() } });
      }

      case 'DELETE': {
        // Remove staff member
        if (!staffId) {
          return errorResponse('Staff ID required');
        }

        // Verify staff exists in team
        const staffDoc = await staffRef.doc(staffId).get();
        if (!staffDoc.exists) {
          return errorResponse('Staff no encontrado / Staff not found', 404);
        }

        // Delete staff
        await staffDoc.ref.delete();

        return successResponse({ success: true });
      }

      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error: any) {
    console.error('API Staff Error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
};

export { handler };
