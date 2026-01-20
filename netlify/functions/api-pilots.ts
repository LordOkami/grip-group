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
  const teamData = teamDoc.data();
  const pilotsRef = teamDoc.ref.collection('pilots');

  // Get pilot ID from query string for PUT/DELETE
  const pilotId = event.queryStringParameters?.id;

  try {
    switch (event.httpMethod) {
      case 'GET': {
        // Get all pilots for the team
        const pilotsSnapshot = await pilotsRef.orderBy('createdAt').get();
        const pilots = pilotsSnapshot.docs.map(doc => ({
          id: doc.id,
          teamId: teamDoc.id,
          ...doc.data()
        }));

        return successResponse({ pilots });
      }

      case 'POST': {
        // Add new pilot
        const body = JSON.parse(event.body || '{}');

        // Check pilot count
        const pilotsCount = await pilotsRef.count().get();
        const count = pilotsCount.data().count;

        if (count >= teamData.numberOfPilots) {
          return errorResponse(
            `El equipo ya tiene el máximo de pilotos (${teamData.numberOfPilots}) / Team already has maximum pilots (${teamData.numberOfPilots})`
          );
        }

        // Validate required fields
        const requiredFields = ['name', 'surname', 'dni', 'email', 'phone', 'emergencyContactName', 'emergencyContactPhone'];
        for (const field of requiredFields) {
          if (!body[field]) {
            return errorResponse(`Campo obligatorio: ${field} / Required field: ${field}`);
          }
        }

        // Check DNI uniqueness within team
        const existingDni = await pilotsRef.where('dni', '==', body.dni).limit(1).get();
        if (!existingDni.empty) {
          return errorResponse('Ya existe un piloto con ese DNI en el equipo / A pilot with that ID already exists in the team');
        }

        // Create pilot
        const now = FieldValue.serverTimestamp();
        const pilotRef = pilotsRef.doc();

        const pilotData = {
          teamId: teamDoc.id,
          name: body.name,
          surname: body.surname,
          dni: body.dni,
          email: body.email,
          phone: body.phone,
          emergencyContactName: body.emergencyContactName,
          emergencyContactPhone: body.emergencyContactPhone,
          drivingLevel: body.drivingLevel || 'amateur',
          trackExperience: body.trackExperience || '',
          isRepresentative: body.isRepresentative || false,
          createdAt: now,
          updatedAt: now
        };

        await pilotRef.set(pilotData);

        const currentCount = count + 1;

        // Update team status if minimum pilots reached
        if (currentCount >= 4 && teamData.status === 'draft') {
          await teamDoc.ref.update({
            status: 'pending',
            updatedAt: now
          });
        }

        return successResponse({ pilot: { id: pilotRef.id, ...pilotData } }, 201);
      }

      case 'PUT': {
        // Update pilot
        if (!pilotId) {
          return errorResponse('Pilot ID required');
        }

        const body = JSON.parse(event.body || '{}');

        // Verify pilot exists in team
        const pilotDoc = await pilotsRef.doc(pilotId).get();
        if (!pilotDoc.exists) {
          return errorResponse('Piloto no encontrado / Pilot not found', 404);
        }

        // If changing DNI, check uniqueness
        if (body.dni) {
          const dniCheck = await pilotsRef
            .where('dni', '==', body.dni)
            .limit(1)
            .get();

          if (!dniCheck.empty && dniCheck.docs[0].id !== pilotId) {
            return errorResponse('Ya existe un piloto con ese DNI en el equipo / A pilot with that ID already exists in the team');
          }
        }

        // Remove fields that shouldn't be updated
        delete body.id;
        delete body.teamId;
        delete body.createdAt;

        // Add updated timestamp
        body.updatedAt = FieldValue.serverTimestamp();

        await pilotDoc.ref.update(body);

        const updatedDoc = await pilotDoc.ref.get();

        return successResponse({ pilot: { id: updatedDoc.id, teamId: teamDoc.id, ...updatedDoc.data() } });
      }

      case 'DELETE': {
        // Remove pilot
        if (!pilotId) {
          return errorResponse('Pilot ID required');
        }

        // Verify pilot exists and is not representative
        const pilotDoc = await pilotsRef.doc(pilotId).get();
        if (!pilotDoc.exists) {
          return errorResponse('Piloto no encontrado / Pilot not found', 404);
        }

        const pilotData = pilotDoc.data();
        if (pilotData?.isRepresentative) {
          return errorResponse('No puedes eliminar al representante del equipo / Cannot delete the team representative');
        }

        // Delete pilot
        await pilotDoc.ref.delete();

        // Update team status if below minimum
        const pilotsCount = await pilotsRef.count().get();
        const count = pilotsCount.data().count;

        if (count < 4) {
          await teamDoc.ref.update({
            status: 'draft',
            updatedAt: FieldValue.serverTimestamp()
          });
        }

        return successResponse({ success: true });
      }

      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error: any) {
    console.error('API Pilots Error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
};

export { handler };
