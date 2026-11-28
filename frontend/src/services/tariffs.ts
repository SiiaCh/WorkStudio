import type { Tariff } from "../types";
export type ApiTariff = { id: string; name: string; price: string | number; version: number };
export const mapTariff = (t: ApiTariff): Tariff => ({ id: t.id, name: t.name, price: Number(t.price), version: t.version });
export const tariffPayload = (t: Tariff) => ({ name: t.name, price: t.price });
export const tariffListPath = (role: string) => role === "ADMINISTRATOR" ? "/admin/tariffs" : "/tariffs";
