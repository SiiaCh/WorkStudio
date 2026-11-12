import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";

export async function listNotifications(userId: string, page: number, pageSize: number) {
  const where = { userId };
  const [total, notifications] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ], { isolationLevel: "RepeatableRead" });
  return { notifications, total, page, pageSize };
}
export async function readNotification(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "The notification does not exist.");
  return { notification };
}
