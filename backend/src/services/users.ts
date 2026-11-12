import { prisma } from "../db/prisma.js";
export const publicUserSelect = {
  id: true, name: true, email: true, role: true, emailVerifiedAt: true, createdAt: true,
} as const;
export function getProfile(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
}
