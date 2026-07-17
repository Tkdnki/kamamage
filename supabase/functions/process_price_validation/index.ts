// 🔧 Edge Function Supabase — process_price_validation
// Supporte deux actions : 'validate' et 'reject'.
// Les admins peuvent bypass la règle de non-auto-validation et la limite quotidienne.
//
// Déploiement :
//  supabase functions deploy process_price_validation --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ValidationPayload {
  submission_id: string
  server_name: string
  category: string
  item_key: string
  lot: string | null
  validated_by: string
  action: 'validate' | 'reject'
}

serve(async (req) => {
  const payload: ValidationPayload = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── 1. Récupérer la soumission et le profil du valideur ──
  const { data: submission, error: subErr } = await supabase
    .from('price_submissions')
    .select('submitted_by, status')
    .eq('id', payload.submission_id)
    .single()

  if (subErr || !submission) {
    return new Response('Submission not found', { status: 404 })
  }

  if (submission.status !== 'pending') {
    return new Response('Submission already processed', { status: 409 })
  }

  const { data: validator } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', payload.validated_by)
    .single()

  const isAdmin = validator?.role === 'admin'

  // ── 2. Vérifier la règle de non-auto-validation (sauf admin) ──
  if (!isAdmin && submission.submitted_by === payload.validated_by) {
    return new Response('Cannot validate your own submission', { status: 403 })
  }

  // ── 3. Vérifier la limite de validations par jour (sauf admin) ──
  if (!isAdmin && payload.action === 'validate') {
    const today = new Date().toISOString().slice(0, 10)
    const { count: dailyCount } = await supabase
      .from('price_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('validated_by', payload.validated_by)
      .gte('validated_at', today)

    if (dailyCount && dailyCount >= 50) {
      return new Response('Daily validation limit reached (50)', { status: 429 })
    }
  }

  if (payload.action === 'reject') {
    // ── 4a. Rejet ──
    const { error: rejectErr } = await supabase
      .from('price_submissions')
      .update({
        status: 'rejected',
        validated_by: payload.validated_by,
        validated_at: new Date().toISOString(),
      })
      .eq('id', payload.submission_id)

    if (rejectErr) {
      return new Response(rejectErr.message, { status: 500 })
    }

    return new Response(JSON.stringify({ rejected: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 4b. Validation ──
  const { error: updateErr } = await supabase
    .from('price_submissions')
    .update({
      status: 'validated',
      validated_by: payload.validated_by,
      validated_at: new Date().toISOString(),
    })
    .eq('id', payload.submission_id)

  if (updateErr) {
    return new Response(updateErr.message, { status: 500 })
  }

  // ── 5. Calculer la moyenne des 5 dernières validations ──
  const { data: recent } = await supabase
    .from('price_submissions')
    .select('price')
    .eq('server_name', payload.server_name)
    .eq('category', payload.category)
    .eq('item_key', payload.item_key)
    .eq(payload.lot ? 'lot' : 'lot', payload.lot ?? null)
    .eq('status', 'validated')
    .order('validated_at', { ascending: false })
    .limit(5)

  const prices = (recent ?? []).map(r => r.price)
  const avg = prices.length > 0
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : 0

  if (avg > 0) {
    await supabase.from('consolidated_prices').upsert({
      server_name: payload.server_name,
      category: payload.category,
      item_key: payload.item_key,
      lot: payload.lot,
      price: avg,
      updated_at: new Date().toISOString(),
    })
  }

  // ── 6. Incrémenter le score du valideur (sauf auto-validation admin) ──
  if (submission.submitted_by !== payload.validated_by) {
    await supabase.rpc('increment_profile_score', { profile_id: payload.validated_by, delta: 1 })
  }

  // ── 7. Incrémenter le score du soumetteur ──
  await supabase.rpc('increment_profile_score', { profile_id: submission.submitted_by, delta: 1 })

  return new Response(JSON.stringify({ avg, validated: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
