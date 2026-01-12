export const prerender = false;
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

function getUserFromHeader(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch (e) {
    return null;
  }
}

export const GET: APIRoute = async ({ request }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    // Get user's team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('representative_user_id', user.sub)
      .single();

    if (teamError || !team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('team_staff')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return new Response(JSON.stringify({ staff: data || [] }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const body = await request.json();

    // Get user's team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('representative_user_id', user.sub)
      .single();

    if (teamError || !team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 400 });
    }

    // Check staff count (max 4)
    const { count } = await supabase
      .from('team_staff')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    if (count !== null && count >= 4) {
      return new Response(JSON.stringify({ error: 'Maximum staff members reached (4)' }), { status: 400 });
    }

    // Validate required fields
    const requiredFields = ['name', 'dni', 'phone', 'role'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(JSON.stringify({ error: `Required field: ${field}` }), { status: 400 });
      }
    }

    // Check DNI uniqueness
    const { data: existingDni } = await supabase
      .from('team_staff')
      .select('id')
      .eq('team_id', team.id)
      .eq('dni', body.dni)
      .single();

    if (existingDni) {
      return new Response(JSON.stringify({ error: 'Staff member with this DNI already exists' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('team_staff')
      .insert({
        team_id: team.id,
        name: body.name,
        dni: body.dni,
        phone: body.phone,
        role: body.role
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ staff: data }), { status: 201 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, url }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const staffId = url.searchParams.get('id');
  if (!staffId) {
    return new Response(JSON.stringify({ error: 'Staff ID required' }), { status: 400 });
  }

  try {
    const body = await request.json();

    // Get user's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('representative_user_id', user.sub)
      .single();

    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 400 });
    }

    // Verify staff belongs to team
    const { data: existingStaff } = await supabase
      .from('team_staff')
      .select('id')
      .eq('id', staffId)
      .eq('team_id', team.id)
      .single();

    if (!existingStaff) {
      return new Response(JSON.stringify({ error: 'Staff not found' }), { status: 404 });
    }

    // Check DNI uniqueness if changing
    if (body.dni) {
      const { data: dniCheck } = await supabase
        .from('team_staff')
        .select('id')
        .eq('team_id', team.id)
        .eq('dni', body.dni)
        .neq('id', staffId)
        .single();

      if (dniCheck) {
        return new Response(JSON.stringify({ error: 'Staff member with this DNI already exists' }), { status: 400 });
      }
    }

    delete body.id;
    delete body.team_id;
    delete body.created_at;

    const { data, error } = await supabase
      .from('team_staff')
      .update(body)
      .eq('id', staffId)
      .eq('team_id', team.id)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ staff: data }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const staffId = url.searchParams.get('id');
  if (!staffId) {
    return new Response(JSON.stringify({ error: 'Staff ID required' }), { status: 400 });
  }

  try {
    // Get user's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('representative_user_id', user.sub)
      .single();

    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 400 });
    }

    // Verify staff exists
    const { data: staff } = await supabase
      .from('team_staff')
      .select('id')
      .eq('id', staffId)
      .eq('team_id', team.id)
      .single();

    if (!staff) {
      return new Response(JSON.stringify({ error: 'Staff not found' }), { status: 404 });
    }

    const { error } = await supabase
      .from('team_staff')
      .delete()
      .eq('id', staffId)
      .eq('team_id', team.id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
