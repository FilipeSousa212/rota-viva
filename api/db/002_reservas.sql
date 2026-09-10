-- Reservas consultadas pelo ramo "Já sou cliente" do WhatsApp.
-- Em produção, esta consulta costuma ir ao sistema de reservas da agência (ERP/GDS);
-- esta tabela faz o papel dele enquanto isso.

CREATE TABLE IF NOT EXISTS reservas (
  id           BIGSERIAL PRIMARY KEY,
  telefone     TEXT NOT NULL,                -- formato do WhatsApp: DDI + DDD + número, só dígitos
  cpf_prefixo  CHAR(3) NOT NULL,             -- só os 3 primeiros dígitos, nunca o CPF inteiro
  localizador  TEXT NOT NULL UNIQUE,
  destino      TEXT NOT NULL,
  data_ida     DATE NOT NULL,
  data_volta   DATE NOT NULL,
  voo          TEXT,
  hotel        TEXT,
  status       TEXT NOT NULL DEFAULT 'confirmada'
                 CHECK (status IN ('confirmada', 'emitida', 'em_andamento', 'concluida', 'cancelada')),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservas_telefone_idx ON reservas (telefone);

-- Reserva fictícia para testar o fluxo.
INSERT INTO reservas (telefone, cpf_prefixo, localizador, destino, data_ida, data_volta, voo, hotel, status)
VALUES ('5511900000000', '123', 'RV7K2M', 'Maragogi, AL', '2026-11-14', '2026-11-21',
        'G3 1452 · GRU 07:40 → MCZ 10:55', 'Salinas Maragogi All Inclusive', 'emitida')
ON CONFLICT (localizador) DO NOTHING;
