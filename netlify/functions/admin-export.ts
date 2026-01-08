import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { supabase } from './utils/supabase';
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
      if (typeof value === 'object') value = JSON.stringify(value);
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
  const userId = getUserId(event);
  if (!userId) {
    return unauthorizedResponse();
  }

  // Check admin permission
  if (!isAdmin(event)) {
    return forbiddenResponse();
  }

  try {
    const exportType = event.queryStringParameters?.type || 'teams';
    const format = event.queryStringParameters?.format || 'csv';

    let data: any[] = [];
    let filename = '';
    let columns: { key: string; label: string }[] = [];

    switch (exportType) {
      case 'teams': {
        const { data: teams, error } = await supabase
          .from('teams')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        data = teams || [];
        filename = 'equipos';
        columns = [
          { key: 'name', label: 'Nombre Equipo' },
          { key: 'status', label: 'Estado' },
          { key: 'number_of_pilots', label: 'Num Pilotos' },
          { key: 'representative_name', label: 'Representante Nombre' },
          { key: 'representative_surname', label: 'Representante Apellidos' },
          { key: 'representative_dni', label: 'DNI' },
          { key: 'representative_email', label: 'Email' },
          { key: 'representative_phone', label: 'Telefono' },
          { key: 'address', label: 'Direccion' },
          { key: 'municipality', label: 'Municipio' },
          { key: 'postal_code', label: 'CP' },
          { key: 'province', label: 'Provincia' },
          { key: 'motorcycle_brand', label: 'Marca Moto' },
          { key: 'motorcycle_model', label: 'Modelo Moto' },
          { key: 'engine_capacity', label: 'Cilindrada' },
          { key: 'created_at', label: 'Fecha Registro' }
        ];
        break;
      }

      case 'pilots': {
        const { data: pilots, error } = await supabase
          .from('pilots')
          .select(`
            *,
            teams (name)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Flatten team name
        data = (pilots || []).map(p => ({
          ...p,
          team_name: p.teams?.name || ''
        }));
        filename = 'pilotos';
        columns = [
          { key: 'team_name', label: 'Equipo' },
          { key: 'name', label: 'Nombre' },
          { key: 'surname', label: 'Apellidos' },
          { key: 'dni', label: 'DNI' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Telefono' },
          { key: 'driving_level', label: 'Nivel' },
          { key: 'track_experience', label: 'Experiencia' },
          { key: 'emergency_contact_name', label: 'Contacto Emergencia' },
          { key: 'emergency_contact_phone', label: 'Tel Emergencia' },
          { key: 'is_representative', label: 'Es Representante' }
        ];
        break;
      }

      case 'staff': {
        const { data: staff, error } = await supabase
          .from('team_staff')
          .select(`
            *,
            teams (name)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        data = (staff || []).map(s => ({
          ...s,
          team_name: s.teams?.name || ''
        }));
        filename = 'staff';
        columns = [
          { key: 'team_name', label: 'Equipo' },
          { key: 'name', label: 'Nombre' },
          { key: 'dni', label: 'DNI' },
          { key: 'phone', label: 'Telefono' },
          { key: 'role', label: 'Rol' }
        ];
        break;
      }

      case 'all': {
        // Get all data for comprehensive export
        const [teamsResult, pilotsResult, staffResult] = await Promise.all([
          supabase.from('teams').select('*').order('name'),
          supabase.from('pilots').select('*, teams(name)').order('team_id'),
          supabase.from('team_staff').select('*, teams(name)').order('team_id')
        ]);

        if (teamsResult.error) throw teamsResult.error;
        if (pilotsResult.error) throw pilotsResult.error;
        if (staffResult.error) throw staffResult.error;

        // Return JSON for 'all' type
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="grip-club-export-${new Date().toISOString().split('T')[0]}.json"`
          },
          body: JSON.stringify({
            exported_at: new Date().toISOString(),
            teams: teamsResult.data,
            pilots: pilotsResult.data?.map(p => ({ ...p, team_name: p.teams?.name })),
            staff: staffResult.data?.map(s => ({ ...s, team_name: s.teams?.name }))
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
