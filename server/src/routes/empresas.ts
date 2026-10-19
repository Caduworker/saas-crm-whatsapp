import { Router } from 'express';
import { supabase } from '../supabase/client.js';
import { requiereRol } from '../middleware/autenticacion.js';

export const empresasRouter = Router();

// Cada CRM tiene una sola empresa: se crea una vez con `npm run configurar`
// y la base no deja agregar otra (ver el índice `empresas_una_sola` en
// database/instalar.sql). Desde la app solo se edita su marca.

// El dueño edita la marca de su empresa (colores + logo). Se usa el
// empresa_id de la sesión autenticada, nunca uno mandado por el body.
empresasRouter.patch('/empresas/mi-empresa', requiereRol('dueno'), async (req, res) => {
  const { color_primario, color_acento, logo_url } = req.body;

  try {
    const { error } = await supabase
      .from('empresas')
      .update({
        color_primario: color_primario || null,
        color_acento: color_acento || null,
        logo_url: logo_url || null,
      })
      .eq('id', req.usuarioAutenticado!.empresa_id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando marca de la empresa:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});
