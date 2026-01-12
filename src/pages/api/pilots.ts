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
      .from('pilots')
      .select('*')
      .eq('team_id', team.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return new Response(JSON.stringify({ pilots: data || [] }), { status: 200 });
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
      .select('id, number_of_pilots')
      .eq('representative_user_id', user.sub)
      .single();

    if (teamError || !team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 400 });
    }

    // Check pilot count
    const { count } = await supabase
      .from('pilots')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    if (count !== null && count >= team.number_of_pilots) {
      return new Response(JSON.stringify({ error: `Maximum pilots reached (${team.number_of_pilots})` }), { status: 400 });
    }

    // Validate required fields
    const requiredFields = ['name', 'surname', 'dni', 'email', 'phone', 'emergency_contact_name', 'emergency_contact_phone'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(JSON.stringify({ error: `Required field: ${field}` }), { status: 400 });
      }
    }

    // Check DNI uniqueness
    const { data: existingDni } = await supabase
      .from('pilots')
      .select('id')
      .eq('team_id', team.id)
      .eq('dni', body.dni)
      .single();

    if (existingDni) {
      return new Response(JSON.stringify({ error: 'Pilot with this DNI already exists' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('pilots')
      .insert({
        team_id: team.id,
        name: body.name,
        surname: body.surname,
        dni: body.dni,
        email: body.email,
        phone: body.phone,
        emergency_contact_name: body.emergency_contact_name,
        emergency_contact_phone: body.emergency_contact_phone,
        driving_level: body.driving_level || 'amateur',
        track_experience: body.track_experience,
        is_representative: body.is_representative || false
      })
      .select()
      .single();

    const currentCount = (count || 0) + 1;

    if (error) throw error;

    // Update team status if minimum pilots reached
    if (currentCount >= 4) {
      await supabase
        .from('teams')
        .update({ status: 'pending' })
        .eq('id', team.id)
        .eq('status', 'draft');
    }

    return new Response(JSON.stringify({ pilot: data }), { status: 201 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, url }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const pilotId = url.searchParams.get('id');
  if (!pilotId) {
    return new Response(JSON.stringify({ error: 'Pilot ID required' }), { status: 400 });
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

    // Verify pilot belongs to team
    const { data: existingPilot } = await supabase
      .from('pilots')
      .select('id')
      .eq('id', pilotId)
      .eq('team_id', team.id)
      .single();

    if (!existingPilot) {
      return new Response(JSON.stringify({ error: 'Pilot not found' }), { status: 404 });
    }

    // Check DNI uniqueness if changing
    if (body.dni) {
      const { data: dniCheck } = await supabase
        .from('pilots')
        .select('id')
        .eq('team_id', team.id)
        .eq('dni', body.dni)
        .neq('id', pilotId)
        .single();

      if (dniCheck) {
        return new Response(JSON.stringify({ error: 'Pilot with this DNI already exists' }), { status: 400 });
      }
    }

    delete body.id;
    delete body.team_id;
    delete body.created_at;
    delete body.pilot_number;

    const { data, error } = await supabase
      .from('pilots')
      .update(body)
      .eq('id', pilotId)
      .eq('team_id', team.id)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ pilot: data }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const user = getUserFromHeader(request);
  if (!user?.sub) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const pilotId = url.searchParams.get('id');
  if (!pilotId) {
    return new Response(JSON.stringify({ error: 'Pilot ID required' }), { status: 400 });
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

    // Verify pilot
    const { data: pilot } = await supabase
      .from('pilots')
      .select('id, is_representative')
      .eq('id', pilotId)
      .eq('team_id', team.id)
      .single();

    if (!pilot) {
      return new Response(JSON.stringify({ error: 'Pilot not found' }), { status: 404 });
    }

    if (pilot.is_representative) {
      return new Response(JSON.stringify({ error: 'Cannot delete team representative' }), { status: 400 });
    }

    const { error } = await supabase
      .from('pilots')
      .delete()
      .eq('id', pilotId)
      .eq('team_id', team.id);

    if (error) throw error;

    // Update team status if below minimum
    const { count } = await supabase
      .from('pilots')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    if (count !== null && count < 4) {
      await supabase
        .from('teams')
        .update({ status: 'draft' })
        .eq('id', team.id);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
