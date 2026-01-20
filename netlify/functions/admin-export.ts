import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getFirestoreDb } from './utils/firebase-admin';
import {
  getUserId,
  isAdmin,
  corsHeaders,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse
} from './utils/auth';

// Helper to convert array of objects to CSV
function arrayToCSV(data: any[], columns: { key: string; label: string }[]): string {
  if (!data || data.length === 0) return '';

  // Header row
  const header = columns.map(c => `"${c.label}"`).join(',');

  // Data rows
  const rows = data.map(item => {
    return columns.map(c => {
      let value = item[c.key];
      if (value === null || value === undefined) value = '';
      if (typeof value === 'object') {
        // Handle Firestore Timestamp
        if (value.toDate) {
          value = value.toDate().toISOString();
        } else {
          value = JSON.stringify(value);
        }
      }
      // Escape quotes and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Only GET allowed
  if (event.httpMethod !== 'GET') {
    return errorResponse('Method not allowed', 405);
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

  try {
    const exportType = event.queryStringParameters?.type || 'teams';
    const format = event.queryStringParameters?.format || 'csv';

    let data: any[] = [];
    let filename = '';
    let columns: { key: string; label: string }[] = [];

    switch (exportType) {
      case 'teams': {
        const teamsSnapshot = await db.collection('teams')
          .orderBy('createdAt', 'desc')
          .get();

        data = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filename = 'equipos';
        columns = [
          { key: 'name', label: 'Nombre Equipo' },
          { key: 'status', label: 'Estado' },
          { key: 'numberOfPilots', label: 'Num Pilotos' },
          { key: 'representativeName', label: 'Representante Nombre' },
          { key: 'representativeSurname', label: 'Representante Apellidos' },
          { key: 'representativeDni', label: 'DNI' },
          { key: 'representativeEmail', label: 'Email' },
          { key: 'representativePhone', label: 'Telefono' },
          { key: 'address', label: 'Direccion' },
          { key: 'municipality', label: 'Municipio' },
          { key: 'postalCode', label: 'CP' },
          { key: 'province', label: 'Provincia' },
          { key: 'motorcycleBrand', label: 'Marca Moto' },
          { key: 'motorcycleModel', label: 'Modelo Moto' },
          { key: 'engineCapacity', label: 'Cilindrada' },
          { key: 'createdAt', label: 'Fecha Registro' }
        ];
        break;
      }

      case 'pilots': {
        const teamsSnapshot = await db.collection('teams').get();

        const allPilots: any[] = [];
        for (const teamDoc of teamsSnapshot.docs) {
          const teamData = teamDoc.data();
          const pilotsSnapshot = await teamDoc.ref.collection('pilots')
            .orderBy('createdAt', 'desc')
            .get();

          pilotsSnapshot.docs.forEach(pilotDoc => {
            allPilots.push({
              id: pilotDoc.id,
              teamName: teamData.name,
              ...pilotDoc.data()
            });
          });
        }

        data = allPilots;
        filename = 'pilotos';
        columns = [
          { key: 'teamName', label: 'Equipo' },
          { key: 'name', label: 'Nombre' },
          { key: 'surname', label: 'Apellidos' },
          { key: 'dni', label: 'DNI' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Telefono' },
          { key: 'drivingLevel', label: 'Nivel' },
          { key: 'trackExperience', label: 'Experiencia' },
          { key: 'emergencyContactName', label: 'Contacto Emergencia' },
          { key: 'emergencyContactPhone', label: 'Tel Emergencia' },
          { key: 'isRepresentative', label: 'Es Representante' }
        ];
        break;
      }

      case 'staff': {
        const teamsSnapshot = await db.collection('teams').get();

        const allStaff: any[] = [];
        for (const teamDoc of teamsSnapshot.docs) {
          const teamData = teamDoc.data();
          const staffSnapshot = await teamDoc.ref.collection('staff')
            .orderBy('createdAt', 'desc')
            .get();

          staffSnapshot.docs.forEach(staffDoc => {
            allStaff.push({
              id: staffDoc.id,
              teamName: teamData.name,
              ...staffDoc.data()
            });
          });
        }

        data = allStaff;
        filename = 'staff';
        columns = [
          { key: 'teamName', label: 'Equipo' },
          { key: 'name', label: 'Nombre' },
          { key: 'dni', label: 'DNI' },
          { key: 'phone', label: 'Telefono' },
          { key: 'role', label: 'Rol' }
        ];
        break;
      }

      case 'all': {
        // Get all data for comprehensive export
        const teamsSnapshot = await db.collection('teams')
          .orderBy('name')
          .get();

        const teams: any[] = [];
        const pilots: any[] = [];
        const staff: any[] = [];

        for (const teamDoc of teamsSnapshot.docs) {
          const teamData = { id: teamDoc.id, ...teamDoc.data() };
          teams.push(teamData);

          // Get pilots for this team
          const pilotsSnapshot = await teamDoc.ref.collection('pilots').get();
          pilotsSnapshot.docs.forEach(pilotDoc => {
            pilots.push({
              id: pilotDoc.id,
              teamName: teamData.name,
              ...pilotDoc.data()
            });
          });

          // Get staff for this team
          const staffSnapshot = await teamDoc.ref.collection('staff').get();
          staffSnapshot.docs.forEach(staffDoc => {
            staff.push({
              id: staffDoc.id,
              teamName: teamData.name,
              ...staffDoc.data()
            });
          });
        }

        // Return JSON for 'all' type
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="grip-club-export-${new Date().toISOString().split('T')[0]}.json"`
          },
          body: JSON.stringify({
            exportedAt: new Date().toISOString(),
            teams,
            pilots,
            staff
          }, null, 2)
        };
      }

      default:
        return errorResponse('Invalid export type. Use: teams, pilots, staff, or all');
    }

    // Generate CSV
    const csv = arrayToCSV(data, columns);
    const dateStr = new Date().toISOString().split('T')[0];

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}-${dateStr}.csv"`
      },
      body: '\ufeff' + csv // BOM for Excel UTF-8 compatibility
    };

  } catch (error: any) {
    console.error('Admin Export Error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
};

export { handler };
