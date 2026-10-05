# ADR-011-MONEY_REPRESENTATION

## Status
Accepted

## Decision
Implements FIN-001. Authoritative monetary amounts are stored as integer minor units (e.g. sen for MYR) in a PostgreSQL `BIGINT` column, together with an ISO 4217 `currency` column (default `MYR`). Arithmetic on authoritative totals uses integers/BigInt, never floating point. Conversion to and from display format happens only at the API/UI boundary.

## Consequence
- APIs accept and return amounts as integer minor units plus currency.
- Totals and aggregations are computed in the database or with integer arithmetic and remain tenant-scoped.
- Multi-currency conversion is out of scope until a future ADR.
