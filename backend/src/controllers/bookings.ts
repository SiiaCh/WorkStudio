import type { RequestHandler } from "express";
import { z } from "zod";
import * as bookings from "../services/bookings.js";
import * as recurring from "../services/recurring.js";
import * as notifications from "../services/notifications.js";
import {
  bookingCreateSchema, adminBookingCreateSchema, bookingUpdateSchema, cancelSchema,
  historySchema, calendarSchema, adminListSchema, recurringSchema, listShape,
} from "../validation/bookings.js";
import { resourceId, operationKey } from "./catalog.js";

export const create: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await bookings.createClientBooking(req.auth!.userId, bookingCreateSchema.parse(req.body)) });
};
export const history: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.listBookings(historySchema.parse(req.query), req.auth!.userId) });
};
export const calendar: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.calendar(req.auth!.userId, calendarSchema.parse(req.query)) });
};
export const detail: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.getBooking(resourceId(req), req.auth!.userId) });
};
export const recurringPreview: RequestHandler = async (req, res) => {
  res.json({ data: await recurring.previewSeries(req.auth!.userId, recurringSchema.parse(req.body)) });
};
export const recurringCreate: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await recurring.createSeries(req.auth!.userId, recurringSchema.parse(req.body)) });
};
export const adminList: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.listBookings(adminListSchema.parse(req.query)) });
};
export const adminDetail: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.getBooking(resourceId(req)) });
};
export const adminCreate: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await bookings.createAdminBooking(req.auth!.userId, operationKey(req), adminBookingCreateSchema.parse(req.body)) });
};
export const adminEdit: RequestHandler = async (req, res) => {
  res.json({ data: await bookings.editAdminBooking(req.auth!.userId, operationKey(req), resourceId(req), bookingUpdateSchema.parse(req.body)) });
};
export const adminCancel: RequestHandler = async (req, res) => {
  const input = cancelSchema.parse(req.body);
  res.json({ data: await bookings.cancelAdminBooking(req.auth!.userId, operationKey(req), resourceId(req), input.version) });
};
const notificationQuery = z.strictObject({ page: listShape.page, pageSize: listShape.pageSize });
export const notificationList: RequestHandler = async (req, res) => {
  const input = notificationQuery.parse(req.query);
  res.json({ data: await notifications.listNotifications(req.auth!.userId, input.page, input.pageSize) });
};
export const notificationRead: RequestHandler = async (req, res) => {
  z.strictObject({}).parse(req.body);
  res.json({ data: await notifications.readNotification(req.auth!.userId, resourceId(req)) });
};
