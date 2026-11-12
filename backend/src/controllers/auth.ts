import type { RequestHandler } from "express";
import { registrationSchema, loginSchema, verificationSchema, resendSchema } from "../validation/auth.js";
import * as auth from "../services/auth.js";
import { getProfile } from "../services/users.js";

export const register: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await auth.register(registrationSchema.parse(req.body)) });
};
export const verifyEmail: RequestHandler = async (req, res) => {
  const { token } = verificationSchema.parse(req.method === "GET" ? req.query : req.body);
  await auth.confirmEmail(token);
  res.json({ data: { message: "Your email address has been confirmed." } });
};
export const resend: RequestHandler = async (req, res) => {
  const { email } = resendSchema.parse(req.body);
  res.status(202).json({ data: await auth.resendVerification(email) });
};
export const login: RequestHandler = async (req, res) => {
  res.json({ data: await auth.login(loginSchema.parse(req.body)) });
};
export const logout: RequestHandler = async (req, res) => {
  await auth.logout(req.auth!.sessionId);
  res.json({ data: { message: "This session has been signed out." } });
};
export const profile: RequestHandler = async (req, res) => {
  res.json({ data: { user: await getProfile(req.auth!.userId) } });
};
