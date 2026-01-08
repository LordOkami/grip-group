export const prerender = false;
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

function getUserFromHeader(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    try {
        // Decode JWT payload (without verification for now - relying on Netlify context in production or assuming local dev trust)
        // specific verification requires public key which is async
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload; // contains 'sub' (user id), 'email', 'app_metadata', 'user_metadata'
    } catch (e) {
        return null;
    }
}

export const GET: APIRoute = async ({ request, locals }) => {
    // Try to get user from Locals (Netlify Adapter)
    let user = (locals as any).netlify?.context?.clientContext?.user;

    // Fallback to manual decoding (useful for local dev or if context is missing)
    if (!user) {
        user = getUserFromHeader(request);
    }

    if (!user || !user.sub) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { data: team, error } = await supabase
            .from('teams')
            .select('*')
            .eq('representative_user_id', user.sub)
            .single();

        // PGRST116 is "no rows returned" -> null result, which is fine (no team yet)
        if (error && error.code !== 'PGRST116') {
            console.error('Supabase GET error:', error);
            throw error;
        }

        return new Response(JSON.stringify({ team: team || null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('GET /api/teams error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Error fetching team' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    let user = (locals as any).netlify?.context?.clientContext?.user;
    if (!user) user = getUserFromHeader(request);

    if (!user || !user.sub) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    try {
        const body = await request.json();

        // Validate required fields (basic validation)
        const required = ['name', 'number_of_pilots', 'representative_dni'];
        for (const field of required) {
            if (!body[field]) throw new Error(`Missing field: ${field}`);
        }

        // Prepare team data with defaults for required database fields
        const teamData = {
            ...body,
            representative_user_id: user.sub,
            representative_email: body.representative_email || user.email,
            // Set defaults for fields that might be required by the database
            status: body.status || 'draft',
            gdpr_consent_date: body.gdpr_consent ? new Date().toISOString() : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('teams')
            .insert(teamData)
            .select()
            .single();

        if (error) {
            console.error('Supabase insert error:', error);
            throw new Error(error.message || 'Database error');
        }

        return new Response(JSON.stringify({ team: data }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('POST /api/teams error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Error creating team' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const PUT: APIRoute = async ({ request, locals }) => {
    let user = (locals as any).netlify?.context?.clientContext?.user;
    if (!user) user = getUserFromHeader(request);

    if (!user || !user.sub) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    try {
        const body = await request.json();

        // Update gdpr_consent_date if consent is being set
        const updateData = {
            ...body,
            updated_at: new Date().toISOString(),
        };

        // If gdpr_consent is being set to true, update the date
        if (body.gdpr_consent === true) {
            updateData.gdpr_consent_date = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('teams')
            .update(updateData)
            .eq('representative_user_id', user.sub) // Ensure user owns the team
            .select()
            .single();

        if (error) {
            console.error('Supabase update error:', error);
            throw new Error(error.message || 'Database error');
        }

        return new Response(JSON.stringify({ team: data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('PUT /api/teams error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Error updating team' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
