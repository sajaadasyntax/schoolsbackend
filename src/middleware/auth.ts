import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  branchId?: string;
  branchName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token =
    (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) ||
    req.cookies?.auth_token;

  if (!token) {
    res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || "default-secret";
    const decoded = jwt.verify(token, secret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "رمز المصادقة غير صالح أو منتهي الصلاحية" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا المورد" });
      return;
    }
    next();
  };
}
