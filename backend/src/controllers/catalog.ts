import type { Request, RequestHandler } from "express";
import * as catalog from "../services/catalog.js";
import * as status from "../services/workspace-status.js";
import { availability } from "../services/availability.js";
import {
  idSchema, operationKeySchema, workspaceCreateSchema, workspaceUpdateSchema,
  tariffCreateSchema, tariffUpdateSchema, deleteSchema, statusSchema,
} from "../validation/catalog.js";
import { availabilitySchema } from "../validation/bookings.js";

export const operationKey = (req: Request) => operationKeySchema.parse(req.get("Idempotency-Key"));
export const resourceId = (req: Request) => idSchema.parse(req.params.id);
export const workspaces: RequestHandler = async (_req, res) => { res.json({ data: await catalog.listWorkspaces() }); };
export const workspace: RequestHandler = async (req, res) => { res.json({ data: await catalog.getWorkspace(resourceId(req)) }); };
export const tariffs: RequestHandler = async (_req, res) => { res.json({ data: await catalog.listTariffs() }); };
export const availabilityQuery: RequestHandler = async (req, res) => { res.json({ data: await availability(availabilitySchema.parse(req.query)) }); };
export const createWorkspace: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await catalog.createWorkspace(req.auth!.userId, operationKey(req), workspaceCreateSchema.parse(req.body)) });
};
export const updateWorkspace: RequestHandler = async (req, res) => {
  res.json({ data: await catalog.updateWorkspace(req.auth!.userId, operationKey(req), resourceId(req), workspaceUpdateSchema.parse(req.body)) });
};
export const deleteWorkspace: RequestHandler = async (req, res) => {
  const input = deleteSchema.parse(req.body);
  res.json({ data: await catalog.deleteWorkspace(req.auth!.userId, operationKey(req), resourceId(req), input.version) });
};
export const createTariff: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await catalog.createTariff(req.auth!.userId, operationKey(req), tariffCreateSchema.parse(req.body)) });
};
export const updateTariff: RequestHandler = async (req, res) => {
  res.json({ data: await catalog.updateTariff(req.auth!.userId, operationKey(req), resourceId(req), tariffUpdateSchema.parse(req.body)) });
};
export const deleteTariff: RequestHandler = async (req, res) => {
  const input = deleteSchema.parse(req.body);
  res.json({ data: await catalog.deleteTariff(req.auth!.userId, operationKey(req), resourceId(req), input.version) });
};
export const affectedBookings: RequestHandler = async (req, res) => {
  res.json({ data: await status.affectedBookings(resourceId(req)) });
};
export const changeStatus: RequestHandler = async (req, res) => {
  res.json({ data: await status.changeWorkspaceStatus(req.auth!.userId, operationKey(req), resourceId(req), statusSchema.parse(req.body)) });
};
