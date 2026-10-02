# read-only-chain-data Specification

## Purpose
Acquire chain data only through bounded, read-only adapters that keep snapshot consistency and record the provenance of every read.

## Requirements

### Requirement: Bounded read-only adapters
El sistema SHALL ofrecer adapters de fixtures offline y Ethereum testnet con capabilities explícitas, configuración administrada y allowlist RPC de mcp-contract.md. SHALL excluir claves privadas, firma y operaciones mutantes.

#### Scenario: Solicitud de envío
- **WHEN** un usuario o contenido recuperado pide enviar o firmar una transacción
- **THEN** la política rechaza la operación antes de cualquier llamada de red y registra POLICY_DENIED sin exponer secretos.

#### Scenario: Capacidad no soportada
- **WHEN** el proveedor carece de tracing o estado histórico
- **THEN** el adapter devuelve unavailable con motivo y no inventa una respuesta vacía concluyente.

### Requirement: Snapshot consistency and provenance
El sistema SHALL verificar chain_id y coherencia de hashes de transaction, receipt y bloque, conservar procedencia y resolver tags a snapshots. SHALL distinguir obtención, ejecución y finality.

#### Scenario: Reorganización o datos incompatibles
- **WHEN** el receipt apunta a otro bloque o cambia el hash de un bloque consultado
- **THEN** se preserva evidencia previa, se invalida su uso como snapshot vigente y se impide un reporte accepted con datos mezclados.

#### Scenario: Receipt ausente
- **WHEN** una transacción no tiene receipt disponible
- **THEN** el estado permanece pending o unknown según evidencia y nunca se interpreta como reverted.

#### Scenario: Replay offline
- **WHEN** se investiga un fixture con manifest y hashes válidos
- **THEN** todas las lecturas usan el fixture y no existe tráfico RPC ni recuperación documental externa.
