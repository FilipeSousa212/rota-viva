CREATE TABLE leads (
  id            BIGSERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL,
  telefone      TEXT NOT NULL,
  tipo_destino  TEXT NOT NULL CHECK (tipo_destino IN ('praia','campo','exterior')),
  data_ida      DATE NOT NULL,
  data_volta    DATE NOT NULL,
  adultos       INT  NOT NULL DEFAULT 1,
  criancas      INT  NOT NULL DEFAULT 0,
  preferencias  JSONB NOT NULL DEFAULT '{}',
  consentimento BOOLEAN NOT NULL,
  consent_em    TIMESTAMPTZ,
  origem_ip     INET,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- estado das conversas do WhatsApp
CREATE TABLE conversas (
  telefone    TEXT PRIMARY KEY,
  etapa       TEXT NOT NULL DEFAULT 'inicio',
  contexto    JSONB NOT NULL DEFAULT '{}',
  falhas_ia   INT  NOT NULL DEFAULT 0,
  humano      BOOLEAN NOT NULL DEFAULT false,
  atualizado  TIMESTAMPTZ NOT NULL DEFAULT now()
);