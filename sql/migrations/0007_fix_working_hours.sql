-- =============================================================================
-- 0007_fix_working_hours.sql
-- Corrige is_slot_available para o formato correto de working_hours.
--
-- FORMATO CORRETO (ISO weekday numbers, arrays de janelas por dia):
--   {"1": [{"start":"09:00","end":"12:00"},{"start":"14:00","end":"18:00"}],
--    "2": [{"start":"09:00","end":"18:00"}],
--    "7": null}
--
-- Chave: TO_CHAR(timestamp, 'ID') → '1'=Segunda...'7'=Domingo (ISO 8601)
-- Valor: array de TimeWindow objects OU null (dia fechado)
--
-- PROBLEMA QUE RESOLVE:
--   Versão anterior assumia objeto único: v_day_hours->>'start'
--   Novo formato é array: v_day_hours->0->>'start'
--   Além disso, a chave deve ser número ISO ('1'-'7'), não nome ('monday')
-- =============================================================================

-- Atualiza COMMENT para documentar o formato canônico
COMMENT ON COLUMN professionals.working_hours IS
  'JSONB com chaves ISO weekday ("1"=Seg.."7"=Dom) e valor = array de TimeWindow.
   Formato: {"1":[{"start":"09:00","end":"18:00"}],"7":null}
   null = dia fechado. Array vazio não usado — usar null.
   Suporta múltiplas janelas por dia: [{"start":"09:00","end":"12:00"},{"start":"14:00","end":"18:00"}]';

-- =============================================================================
-- Recria is_slot_available com suporte a:
--   1. Chaves ISO numéricas ('1'-'7')
--   2. Valor como ARRAY de janelas (múltiplas janelas por dia)
--   3. Slot válido se cabe em QUALQUER das janelas do dia
-- =============================================================================
CREATE OR REPLACE FUNCTION is_slot_available(
  p_professional_id      UUID,
  p_starts_at            TIMESTAMPTZ,
  p_ends_at              TIMESTAMPTZ,
  p_contact_id           UUID DEFAULT NULL,
  p_travel_buffer_before INT  DEFAULT 0,
  p_travel_buffer_after  INT  DEFAULT 0
) RETURNS TABLE (available BOOLEAN, reason TEXT) AS $$
DECLARE
  v_working_hours    JSONB;
  v_service_mode     service_mode;
  v_service_areas    JSONB;
  v_timezone         TEXT;
  v_effective_start  TIMESTAMPTZ;
  v_effective_end    TIMESTAMPTZ;
  v_overlap_count    INT;
  v_window_count     INT;   -- conta janelas que cobrem o slot
  v_day_key          TEXT;
  v_day_hours        JSONB; -- array de {start, end} ou null
  v_slot_start_local TIME;
  v_slot_end_local   TIME;
  v_contact_address  JSONB;
BEGIN
  v_effective_start := p_starts_at - (p_travel_buffer_before || ' minutes')::interval;
  v_effective_end   := p_ends_at   + (p_travel_buffer_after  || ' minutes')::interval;

  SELECT working_hours, service_mode, service_areas, timezone
    INTO v_working_hours, v_service_mode, v_service_areas, v_timezone
  FROM professionals WHERE id = p_professional_id;

  -- ── 1. Verificar horário de trabalho ──────────────────────────────────────
  IF v_working_hours IS NOT NULL THEN
    -- TO_CHAR com 'ID' retorna '1'=Segunda-feira ... '7'=Domingo (ISO 8601)
    -- Deve coincidir com as chaves numéricas do JSONB working_hours
    v_day_key   := TO_CHAR(p_starts_at AT TIME ZONE v_timezone, 'ID');
    v_day_hours := v_working_hours->v_day_key;

    -- Dia fechado: chave ausente ou valor null
    IF v_day_hours IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'outside_working_hours'::TEXT;
      RETURN;
    END IF;

    -- Array vazio também é "fechado"
    IF jsonb_typeof(v_day_hours) = 'array' AND jsonb_array_length(v_day_hours) = 0 THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'outside_working_hours'::TEXT;
      RETURN;
    END IF;

    v_slot_start_local := (p_starts_at AT TIME ZONE v_timezone)::TIME;
    v_slot_end_local   := (p_ends_at   AT TIME ZONE v_timezone)::TIME;

    -- Conta janelas que cobrem o slot inteiro (start <= slot_start AND end >= slot_end)
    -- Slot é válido se cabe em pelo menos 1 janela do dia
    SELECT COUNT(*) INTO v_window_count
    FROM jsonb_array_elements(v_day_hours) AS w
    WHERE (w->>'start')::TIME <= v_slot_start_local
      AND (w->>'end')::TIME   >= v_slot_end_local;

    IF v_window_count = 0 THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'outside_working_hours'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ── 2. Verificar sobreposição com slots ocupados ───────────────────────────
  SELECT COUNT(*) INTO v_overlap_count
  FROM busy_slots
  WHERE professional_id = p_professional_id
    AND tstzrange(effective_start, effective_end, '[)')
        && tstzrange(v_effective_start, v_effective_end, '[)');

  IF v_overlap_count > 0 THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, 'overlapping_appointment_or_block'::TEXT;
    RETURN;
  END IF;

  -- ── 3. Verificar endereço para atendimento em domicílio ───────────────────
  IF v_service_mode = 'home' AND p_contact_id IS NOT NULL THEN
    SELECT address INTO v_contact_address
    FROM contacts WHERE id = p_contact_id;

    IF v_contact_address IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'contact_address_missing'::TEXT;
      RETURN;
    END IF;

    IF v_service_areas IS NOT NULL THEN
      IF NOT (v_contact_address ? 'neighborhood') OR
         NOT (v_service_areas  ? (v_contact_address->>'neighborhood')) THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'out_of_service_area'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE::BOOLEAN, 'available'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_slot_available IS
  'Verifica disponibilidade de slot de agendamento.
   working_hours usa chaves ISO "1"-"7" e arrays de TimeWindow.
   Slot válido se cabe em QUALQUER janela do dia (suporte a break de almoço).
   Reasons: available | outside_working_hours | overlapping_appointment_or_block
            | contact_address_missing | out_of_service_area';
