-- Fase 0 de voz y texto: Claude Haiku 4.5 se retira (no antes del 15-oct-2026).
-- tenant.llm_modelo gana sobre el modelo por proveedor (agent/agent.py,
-- _construir_llm): un negocio que lo tenga fijo fallaría en cada turno del
-- principal y pasaría al respaldo con latencia de más. Va a Claude Sonnet 5,
-- el mismo que usan el respaldo de texto y el modelo por omisión de Anthropic.
--
-- Idempotente: se puede correr dos veces.

update tenant
   set llm_modelo = 'claude-sonnet-5'
 where llm_modelo like 'claude-haiku-4-5%';
