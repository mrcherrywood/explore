-- Migration: Add Blue Cross Blue Shield flag to MA contracts

alter table public.ma_contracts
  add column if not exists is_blue_cross_blue_shield boolean not null default false;

comment on column public.ma_contracts.is_blue_cross_blue_shield is 'True when the contract is affiliated with the Blue Cross Blue Shield Association.';
